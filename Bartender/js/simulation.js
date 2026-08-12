export const SEAT_POSITIONS = Object.freeze([18, 34, 50, 66, 82]);
export const SEAT_DEPTHS = Object.freeze([2, 4, 6, 5, 3]);

export class GuestSimulation {
  constructor(characterIds, { random = Math.random, now = () => Date.now() } = {}) {
    this.characterIds = [...characterIds];
    this.random = random;
    this.now = now;
    this.guests = [];
    this.cooldowns = new Map();
    this.activeId = null;
    this.nextArrivalAt = 0;
    this.arrivalDoorPlayed = false;
  }

  start() {
    this.guests = [];
    this.arrivalDoorPlayed = false;
    const count = 1 + Math.floor(this.random() * 2);
    for (let index = 0; index < count; index += 1) this.arrive(this.now());
    this.nextArrivalAt = this.now() + between(this.random, 120000, 240000);
    return this.snapshot();
  }

  setActive(characterId) { this.activeId = characterId || null; }

  tick(at = this.now()) {
    const events = [];
    for (const guest of [...this.guests]) {
      if (guest.characterId !== this.activeId && at >= guest.leaveAt) {
        this.guests = this.guests.filter((item) => item.characterId !== guest.characterId);
        this.cooldowns.set(guest.characterId, at + 180000);
        events.push({ type: 'left', characterId: guest.characterId });
      }
    }
    if (!this.arrivalDoorPlayed && at >= this.nextArrivalAt - 2000 && at < this.nextArrivalAt && this.guests.length < 4) {
      this.arrivalDoorPlayed = true;
      events.push({ type: 'arrival-door' });
    }
    if (at >= this.nextArrivalAt) {
      if (this.guests.length < 4) {
        const guest = this.arrive(at);
        if (guest) events.push({ type: 'arrived', characterId: guest.characterId });
      }
      this.nextArrivalAt = at + between(this.random, 120000, 240000);
      this.arrivalDoorPlayed = false;
    }
    return events;
  }

  arrive(at = this.now()) {
    if (this.guests.length >= 4) return null;
    const present = new Set(this.guests.map((item) => item.characterId));
    const candidates = this.characterIds.filter((id) => !present.has(id) && (this.cooldowns.get(id) || 0) <= at);
    if (!candidates.length) return null;
    const characterId = candidates[Math.floor(this.random() * candidates.length)];
    const usedSeats = new Set(this.guests.map((item) => item.seat));
    const seats = [0, 1, 2, 3, 4].filter((seat) => !usedSeats.has(seat));
    const seat = seats[Math.floor(this.random() * seats.length)];
    const guest = { characterId, seat, arrivedAt: at, leaveAt: at + between(this.random, 300000, 480000) };
    this.guests.push(guest);
    return { ...guest };
  }

  snapshot() { return this.guests.map((guest) => ({ ...guest })); }
}

export function between(random, min, max) {
  return Math.round(min + random() * (max - min));
}
