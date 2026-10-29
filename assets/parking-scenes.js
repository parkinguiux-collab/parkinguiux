/* Decorative illustrations only: scene shapes are not photographs of a facility. */
(function(scope){
  function render(id){
    let seed=0;for(const char of String(id))seed=(Math.imul(seed,31)+char.charCodeAt(0))>>>0;
    const hue=195+seed%25, variant=seed%6;
    const car=(x,y,color='#82c5ef',scale=1)=>`<g transform="translate(${x} ${y}) scale(${scale})"><rect x="2" y="16" width="12" height="9" rx="3" fill="#416484"/><rect x="43" y="16" width="12" height="9" rx="3" fill="#416484"/><path d="M5 12 12 0h30l10 12v10H3Z" fill="${color}"/><path d="m15 3-5 9h34l-5-9Z" fill="#347bbe"/><rect x="6" y="15" width="8" height="4" rx="2" fill="#fff3c9"/><rect x="42" y="15" width="8" height="4" rx="2" fill="#fff3c9"/></g>`;
    const tree=(x,y,size=1)=>`<g transform="translate(${x} ${y}) scale(${size})"><path d="M0-25V6" stroke="#8aa6ac" stroke-width="5"/><ellipse cy="-30" rx="15" ry="22" fill="#adcfc1"/><ellipse cx="-5" cy="-35" rx="8" ry="13" fill="#c5e0d3"/></g>`;
    const windows=(x,y,cols,rows,w=13,h=12)=>Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>`<rect x="${x+c*(w+7)}" y="${y+r*(h+9)}" width="${w}" height="${h}" rx="2" fill="${(seed+r+c)%3?'#cae3f2':'#92b9d8'}"/>`).join('')).join('');
    const sign=(x,y)=>`<rect x="${x}" y="${y}" width="24" height="25" rx="5" fill="#397fc1"/><text x="${x+12}" y="${y+18}" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="white">P</text>`;
    const scenes=[
      // Open-air lot: a long, low wall, marked parking spaces and several cars.
      `<path d="M28 107h264v55H28Z" fill="#c5d9e7"/><path d="M28 107h264v9H28Z" fill="#8eafca"/><path d="M36 151h250M55 118v32m49-32v32m49-32v32m49-32v32m49-32v32" stroke="#f7fbff" stroke-width="4"/>${car(61,125,'#b7dced',.65)}${car(161,125,'#fff0b9',.65)}${tree(27,119,.75)}${tree(292,130,.9)}${sign(256,75)}<path d="M267 100v25" stroke="#8daabc" stroke-width="4"/>`,
      // Low-rise parking building, with an entrance ramp and a broad front.
      `<path d="M48 62 83 49l192 10v99H48Z" fill="#8baecc"/><path d="M48 62h204v96H48Z" fill="hsl(${hue} 45% 58%)"/><path d="M252 62 275 59v98l-23 1Z" fill="#4f83b1"/>${windows(64,77,8,2,14,12)}<path d="M72 140h157v19H72Z" fill="#466c93"/><path d="m113 158-20 16h134l-20-16Z" fill="#b7cedf"/>${sign(214,129)}${tree(34,154,.85)}${car(167,155,'#8ccbed',.85)}`,
      // A tall, slim tower with stacked horizontal parking decks.
      `<path d="M100 37 128 23l100 11v124H100Z" fill="#789fbe"/><path d="M100 37h105v121H100Z" fill="hsl(${hue} 43% 56%)"/><path d="M205 37 228 34v124h-23Z" fill="#477ba7"/>${windows(115,49,4,4,13,10)}<path d="M123 143h59v16h-59Z" fill="#41688d"/>${sign(73,94)}${tree(259,158,1)}${car(194,154,'#95d0ee',.75)}<path d="M81 119v39" stroke="#8daabc" stroke-width="4"/>`,
      // Canopy: a roof over a row of outdoor parking spaces.
      `<path d="m37 86 31-27h201l24 27Z" fill="#78a5cc"/><path d="M37 86h256v10H37Z" fill="#b5d4e9"/><path d="M57 96v59m98-59v59m121-59v59" stroke="#7b9dbb" stroke-width="7"/><path d="M45 153h241m-206-33v32m61-32v32m61-32v32m61-32v32" stroke="#f9fcff" stroke-width="3"/>${car(85,123,'#8cc5e7',.75)}${car(202,123,'#fff0c2',.75)}${tree(24,159,.85)}${sign(266,118)}`,
      // Neighbourhood building: a stepped roof, warm facade and a parking gate.
      `<path d="M53 80h64V58h119v100H53Z" fill="#a2bdcf"/><path d="M53 80h149v78H53Z" fill="#93b7d0"/><path d="M117 58h119v22H117Z" fill="#c5dce9"/>${windows(68,94,6,2,13,12)}<rect x="220" y="104" width="54" height="54" rx="4" fill="#d3e5ef"/><path d="M228 158v-33h36v33" fill="#577f9e"/>${sign(236,88)}${tree(36,157,.8)}${car(135,155,'#91c8ec',.8)}`,
      // Underground entrance: trees on a raised garden and a recessed ramp.
      `<path d="M32 92h260v18H32Z" fill="#b5d3c5"/><path d="M41 111h242v48H41Z" fill="#b2cddd"/><path d="M104 111h115v49H104Z" fill="#527b9c"/><path d="M112 121h98v37h-98Z" fill="#426482"/><path d="m115 153-20 27h141l-27-27Z" fill="#a2bed2"/><path d="m127 157-13 20m82-20 16 20" stroke="#f9fcff" stroke-width="3"/>${tree(65,91,.8)}${tree(244,91,.8)}${sign(89,78)}${car(145,147,'#8ecbeb',.72)}`
    ];
    return `<svg class="parking-scene" viewBox="0 0 320 190" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="scene-sky" x2="1" y2="1"><stop stop-color="hsl(${hue} 70% 94%)"/><stop offset="1" stop-color="hsl(${hue} 55% 79%)"/></linearGradient></defs><path fill="url(#scene-sky)" d="M0 0h320v190H0Z"/><ellipse cx="262" cy="44" rx="37" ry="14" fill="#ffffff3d"/><path d="M0 159h320v31H0Z" fill="#a8c3d9"/><path d="M0 180h320" stroke="#e5eff7" stroke-width="3"/>${scenes[variant]}</svg><span class="cover-label">주차장 안내 일러스트</span>`;
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={render};else scope.ParkingScenes={render};
})(typeof window!=='undefined'?window:globalThis);
