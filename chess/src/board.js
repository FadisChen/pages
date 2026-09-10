import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const GOLD = 0xc7a25e;
const SQUARE_Y = .04;
export function squarePosition(square) { return new THREE.Vector3(square.charCodeAt(0) - 100.5, SQUARE_Y, 4.5 - Number(square[1])); }

export class ChessBoard {
  constructor(container, onSquare) {
    this.container = container;
    this.onSquare = onSquare;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(37, 1, .1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.setClearColor(0, 0);
    container.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '3D 西洋棋棋盤，點擊棋子選取，拖曳旋轉，滾輪縮放');
    this.renderer.domElement.setAttribute('role', 'img');
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .085;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = .15;
    this.controls.maxPolarAngle = Math.PI / 2.8;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 36;
    this.controls.target.set(0, 0, 0);
    this.pieces = new Map();
    this.tiles = [];
    this.markers = new THREE.Group();
    this.scene.add(this.markers);
    this.effects = [];
    this.tweens = [];
    this.quality = 'high';
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.scene.add(new THREE.HemisphereLight(0xfff1d6, 0x24463b, 2.5));
    const key = new THREE.DirectionalLight(0xffdfaa, 3.5);
    key.position.set(-4, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: .1, far: 30 });
    key.shadow.bias = -.0005;
    key.shadow.normalBias = .035;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9bc8da, 2.1);
    rim.position.set(4, 6, -5);
    this.scene.add(rim);
    this.buildBoard();
    this.resetView('w');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    let down = null;
    this.renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, dragged: false }; });
    this.renderer.domElement.addEventListener('pointermove', e => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7) down.dragged = true;
      if (!down) this.renderer.domElement.style.cursor = this.hit(e) ? 'pointer' : 'grab';
    });
    this.renderer.domElement.addEventListener('pointercancel', () => { down = null; });
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (down && !down.dragged && e.button === 0) onSquare(this.hit(e));
      down = null;
    });
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      container.dispatchEvent(new CustomEvent('rendererror', { detail: '3D 顯示連線中斷，請重新整理頁面。' }));
    });
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop(time => this.frame(time));
  }

  buildBoard() {
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x2e251c, roughness: .4, metalness: .16 });
    const borderMaterial = new THREE.MeshStandardMaterial({ color: GOLD, roughness: .32, metalness: .65 });
    const slab = (w, h, d, y, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.y = y; mesh.receiveShadow = true; mesh.castShadow = true; this.scene.add(mesh); return mesh;
    };
    slab(9.05, .32, 9.05, -.27, baseMaterial);
    slab(9.12, .055, 9.12, -.12, borderMaterial);
    slab(8.99, .12, 8.99, -.043, baseMaterial);
    slab(8.10, .025, 8.10, .009, borderMaterial);
    const ivory = new THREE.MeshStandardMaterial({ color: 0xc3bba4, roughness: .65 });
    const green = new THREE.MeshStandardMaterial({ color: 0x294c40, roughness: .58 });
    const tileGeometry = new THREE.BoxGeometry(.995, .035, .995);
    for (let rank = 1; rank <= 8; rank++) for (let file = 0; file < 8; file++) {
      const square = String.fromCharCode(97 + file) + rank;
      const tile = new THREE.Mesh(tileGeometry, (rank + file) % 2 ? green : ivory);
      tile.position.copy(squarePosition(square)); tile.position.y = .025;
      tile.receiveShadow = true; tile.userData.square = square;
      this.tiles.push(tile); this.scene.add(tile);
    }
    for (let i = 0; i < 8; i++) {
      this.label(String.fromCharCode(65+i), i-3.5, 4.27, 0);
      this.label(String.fromCharCode(65+i), i-3.5, -4.27, Math.PI);
      this.label(String(8-i), -4.28, i-3.5, 0);
      this.label(String(8-i), 4.28, i-3.5, Math.PI);
    }
    for (const x of [-4.28,4.28]) for (const z of [-4.28,4.28]) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(.075), borderMaterial);
      m.position.set(x,.04,z); this.scene.add(m);
    }
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(30,30), new THREE.ShadowMaterial({ opacity: .30 }));
    shadow.rotation.x = -Math.PI/2; shadow.position.y = -.45; shadow.receiveShadow = true; this.scene.add(shadow);
  }

  label(text, x, z, angle) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#d6bd83'; ctx.font = '52px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text,64,66);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.26,.26), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
    mesh.rotation.set(-Math.PI/2,0,angle); mesh.position.set(x,.023,z); this.scene.add(mesh);
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(new URL('../assets/models/chibi-chess.glb', import.meta.url).href);
    this.templates = new Map();
    for (const color of ['w','b']) for (const type of ['p','n','b','r','q','k']) {
      const key = `${color}_${type}`;
      const model = gltf.scene.getObjectByName(key);
      if (!model) throw new Error(`缺少棋子模型 ${key}`);
      model.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
      this.templates.set(key, model);
    }
  }

  createPiece(piece, square) {
    const root = new THREE.Group();
    const model = this.templates.get(`${piece.color}_${piece.type}`).clone(true);
    model.position.set(0,0,0); root.add(model);
    root.userData = { square, type: piece.type, color: piece.color };
    root.rotation.y = piece.color === 'w' ? Math.PI : 0;
    root.position.copy(squarePosition(square)); root.position.y = .05;
    this.scene.add(root);
    return root;
  }

  sync(chess) {
    this.cancelAnimations();
    for (const piece of this.pieces.values()) this.scene.remove(piece);
    this.pieces.clear();
    for (const row of chess.board()) for (const piece of row) if (piece) this.pieces.set(piece.square, this.createPiece(piece, piece.square));
    this.showHighlights(null, []);
    this.setCheck(chess);
  }

  hit(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((event.clientX-rect.left)/rect.width*2-1, -(event.clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.pieces.values(), ...this.tiles], true);
    for (const hit of hits) {
      let object = hit.object;
      while (object && !object.userData.square) object = object.parent;
      if (object?.userData.square) return object.userData.square;
    }
    return null;
  }

  mark(square, color, kind) {
    const group = new THREE.Group(); group.position.copy(squarePosition(square)); group.position.y = .065;
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: kind === 'last' ? .20 : .8, depthWrite: false });
    let geometry;
    if (kind === 'dot') geometry = new THREE.RingGeometry(.10,.17,32);
    else if (kind === 'capture') geometry = new THREE.RingGeometry(.38,.45,4,1,Math.PI/4);
    else geometry = new THREE.PlaneGeometry(.94,.94);
    if (kind === 'selected' || kind === 'check') {
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(.91,.91)), new THREE.LineBasicMaterial({ color, transparent:true, opacity:.9 }));
      line.rotation.x = -Math.PI/2; group.add(line);
      material.opacity = .24;
    }
    const mesh = new THREE.Mesh(geometry, material); mesh.rotation.x = -Math.PI/2; group.add(mesh);
    group.userData.kind = kind;
    return group;
  }

  clearGroup(group) {
    for (const child of [...group.children]) {
      child.traverse(obj => { obj.geometry?.dispose(); if (obj.material) obj.material.dispose(); });
      group.remove(child);
    }
  }

  showHighlights(selected, moves, lastMove) {
    this.clearGroup(this.markers);
    if (lastMove) for (const square of [lastMove.from,lastMove.to]) this.markers.add(this.mark(square,GOLD,'last'));
    if (selected) this.markers.add(this.mark(selected,0xffd479,'selected'));
    const squares = new Set();
    for (const move of moves) if (!squares.has(move.to)) {
      squares.add(move.to); this.markers.add(this.mark(move.to, move.captured ? 0xffa076 : 0x83d2ae, move.captured ? 'capture' : 'dot'));
    }
  }

  setCheck(chess) {
    if (this.checkMarker) { this.scene.remove(this.checkMarker); this.clearGroup(this.checkMarker); this.checkMarker = null; }
    if (chess.isCheck()) {
      const king = chess.board().flat().find(p => p?.type === 'k' && p.color === chess.turn());
      this.checkMarker = this.mark(king.square,0xff6f59,'check'); this.scene.add(this.checkMarker);
    }
  }

  tween(duration, update, finish) {
    return new Promise(resolve => this.tweens.push({ start: performance.now(), duration, update, finish, resolve }));
  }

  async animateMove(move) {
    const moving = this.pieces.get(move.from);
    if (!moving) return;
    const capturedSquare = move.flags.includes('e') ? move.to[0]+move.from[1] : move.to;
    const captured = this.pieces.get(capturedSquare);
    const motions = [];
    if (captured) {
      this.pieces.delete(capturedSquare);
      const initialRotation = captured.rotation.z;
      motions.push(this.tween(480, t => { captured.rotation.z = initialRotation+t*1.3; captured.scale.setScalar(1-t); captured.position.y = .05+t*.45; }, () => this.scene.remove(captured)));
      this.burst(move.to, 'capture');
    }
    const slide = (piece, from, to) => {
      const start = squarePosition(from), end = squarePosition(to);
      piece.userData.square = to; this.pieces.delete(from); this.pieces.set(to, piece);
      return this.tween(430, t => {
        const ease = t*t*(3-2*t);
        piece.position.lerpVectors(start,end,ease); piece.position.y = .05+Math.sin(t*Math.PI)*.24;
      });
    };
    motions.push(slide(moving,move.from,move.to));
    if (move.flags.includes('k') || move.flags.includes('q')) {
      const kingside = move.flags.includes('k');
      const from = (kingside ? 'h' : 'a')+move.from[1], to = (kingside ? 'f' : 'd')+move.from[1];
      motions.push(slide(this.pieces.get(from),from,to));
    }
    if (move.promotion) {
      const replacement = this.createPiece({ type: move.promotion, color: move.color },move.to);
      replacement.visible = false;
      motions.push(this.tween(700, t => {
        if (t < .6) return;
        if (!replacement.visible) { replacement.visible = true; moving.visible = false; this.burst(move.to,'promotion'); }
        replacement.scale.setScalar(Math.min(1, (t-.6)/.4));
      }, () => { this.scene.remove(moving); this.pieces.set(move.to,replacement); }));
    }
    await Promise.all(motions);
  }

  cancelAnimations() {
    for (const tween of this.tweens) { tween.update(1); tween.finish?.(); tween.resolve(); }
    this.tweens = [];
    for (const effect of this.effects) { this.scene.remove(effect.points); effect.points.geometry.dispose(); effect.points.material.dispose(); }
    this.effects = [];
  }

  burst(square, kind = 'capture') {
    if (this.quality === 'off' || this.effects.length >= 5) return;
    const count = this.quality === 'high' ? (kind === 'win' ? 140 : 60) : 24;
    const origin = squarePosition(square);
    const positions = new Float32Array(count*3), velocities = new Float32Array(count*3), colors = new Float32Array(count*3);
    const palette = kind === 'win' ? [0xe8bd67,0x83d2ae,0xffe8bd,0xd77960] : [0xffd986,0xffedbd,0xd8b575];
    for (let i=0;i<count;i++) {
      positions[i*3]=origin.x; positions[i*3+1]=kind==='win'?2:.55; positions[i*3+2]=origin.z;
      velocities[i*3]=(Math.random()-.5)*(kind==='win'?6:2);
      velocities[i*3+1]=1+Math.random()*(kind==='promotion'?4:2.5);
      velocities[i*3+2]=(Math.random()-.5)*(kind==='win'?6:2);
      const color = new THREE.Color(palette[i%palette.length]); color.toArray(colors,i*3);
    }
    const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(positions,3)); geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const material=new THREE.PointsMaterial({size:kind==='win'?.075:.055,vertexColors:true,transparent:true,depthWrite:false});
    const points=new THREE.Points(geometry,material); this.scene.add(points);
    this.effects.push({points,velocities,age:0,life:kind==='win'?3:1.4});
    if (kind==='promotion') {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(.18,.34,2.8,24,1,true),new THREE.MeshBasicMaterial({color:0xffd880,transparent:true,opacity:.3,depthWrite:false,side:THREE.DoubleSide}));
      beam.position.copy(origin); beam.position.y=1.4; this.scene.add(beam);
      this.tween(700,t=>{beam.material.opacity=(1-t)*.35;beam.scale.x=beam.scale.z=1+t;},()=>{this.scene.remove(beam);beam.geometry.dispose();beam.material.dispose();});
    }
  }

  setQuality(value) {
    this.quality=value;
    this.renderer.shadowMap.enabled=value!=='off';
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,value==='high'?1.6:1));
    this.scene.traverse(obj=>{ if(obj.material) for(const mat of Array.isArray(obj.material)?obj.material:[obj.material]) mat.needsUpdate=true; });
    if(value==='off') for(const effect of this.effects) effect.age=effect.life;
    this.resize();
  }

  resetView(side = this.side) {
    this.side=side;
    const sign=side==='w'?1:-1;
    const aspect=this.container.clientWidth/Math.max(this.container.clientHeight,1);
    this.viewAspect=aspect;
    this.camera.aspect=aspect;this.camera.updateProjectionMatrix();
    this.camera.position.set(4.5*sign,10.8,11.7*sign);
    this.controls.target.set(0,0,0);this.camera.lookAt(this.controls.target);
    // Fit the board and the tallest pieces to both viewport dimensions.
    for(let pass=0;pass<3;pass++) {
      this.camera.updateMatrixWorld();
      let extent=0;
      for(const x of [-4.56,4.56])for(const y of [-.4,1.4])for(const z of [-4.56,4.56]) {
        const point=new THREE.Vector3(x,y,z).project(this.camera);
        extent=Math.max(extent,Math.abs(point.x),Math.abs(point.y));
      }
      if(extent<=.90)break;
      this.camera.position.multiplyScalar(extent/.90);
    }
    this.controls.maxDistance=Math.max(28,this.camera.position.length()*1.7);
    this.controls.update();
  }

  resize() {
    const w=this.container.clientWidth,h=this.container.clientHeight;
    if(!w||!h)return;
    const oldAspect=this.camera.aspect;
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);
    if(Math.abs(Math.log((this.viewAspect||oldAspect)/(w/h)))>.06)this.resetView();
  }

  frame(time) {
    const dt=Math.min((time-this.lastTime)/1000,.05);this.lastTime=time;
    for(const tween of [...this.tweens]) {
      const t=Math.min(1,Math.max(0,(time-tween.start)/tween.duration));tween.update(t);
      if(t>=1){tween.finish?.();tween.resolve();this.tweens.splice(this.tweens.indexOf(tween),1);}
    }
    for(let i=this.effects.length-1;i>=0;i--) {
      const e=this.effects[i];e.age+=dt;
      if(e.age>=e.life){this.scene.remove(e.points);e.points.geometry.dispose();e.points.material.dispose();this.effects.splice(i,1);continue;}
      const pos=e.points.geometry.attributes.position;
      for(let j=0;j<pos.count;j++) {e.velocities[j*3+1]-=dt*3;for(let a=0;a<3;a++)pos.array[j*3+a]+=e.velocities[j*3+a]*dt;}
      pos.needsUpdate=true;e.points.material.opacity=1-e.age/e.life;
    }
    if(this.checkMarker) this.checkMarker.children.forEach(c=>{c.material.opacity=(c.isMesh?.19:.7)+Math.sin(time*.004)*.10;});
    this.controls.update();
    this.renderer.render(this.scene,this.camera);
  }
}
