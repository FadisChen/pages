// How a place of birth is said in Chinese. Pure and dependency-free (the lottery reveal and the life story both use it).
//
//   urban:  印度的孟買        (a country-name city is not repeated: 墨西哥城, 香港)
//   rural:  印度孟買近郊的鄉村 (the nearest city names the countryside; a city-state has only 「香港的鄉村」)
//
// `short` is the place without the country ("孟買", "孟買近郊的鄉村"), `full` includes it.

/** @returns {{ short: string, full: string }} */
export function placePhrases(country, city, urban) {
  const c = country || '';
  const t = city && city !== c ? city : '';
  if (!c) return { short: t, full: t };
  if (!t) return urban ? { short: c, full: c } : { short: '鄉村', full: `${c}的鄉村` };
  const owns = t.startsWith(c); // 墨西哥城, 巴西利亞: the city already carries the country's name
  if (urban) return { short: t, full: owns ? t : `${c}${t[0] === '的' ? '' : '的'}${t}` };
  const short = `${t}近郊的鄉村`;
  return { short, full: owns ? short : `${c}${short}` };
}
