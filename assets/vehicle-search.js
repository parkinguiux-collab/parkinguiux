(function (global) {
  'use strict';
  const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });
  const aliases = { '현대': '현대자동차 hyundai', '기아': '기아자동차 kia', '벤츠': '메르세데스 벤츠 mercedes benz', 'BMW': '비엠더블유', 'MINI': '미니', '한국지엠': '쉐보레 chevrolet', 'GM': '쉐보레 캐딜락 cadillac', '케이지모빌리티': '쌍용 kg모빌리티 kgm', '토요타': '도요타 렉서스 toyota lexus', '테슬라코리아 유한회사': '테슬라 tesla', 'Lotus': '로터스', 'McLaren Automotive Limited': '맥라렌', 'ASTON MARTIN LAGONDA LIMITED': '애스턴마틴', 'PSA Automobiles': '푸조 시트로엥', '크라이슬러': '지프 jeep', 'INEOS Automotive': '이네오스', 'BYD': '비야디' };
  const normalize = text => String(text).normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
  function prepare(rows) {
    return rows.map(row => ({ ...row, search: normalize(`${row.brand} ${row.model} ${row.type} ${aliases[row.brand] || ''} ${row.brand.includes('르노') ? '르노코리아 르노삼성 renault' : ''} ${/^(?:G[789]0|GV[678]0)/i.test(row.model) && row.brand === '현대' ? '제네시스 genesis' : ''}`) })).sort((a, b) => collator.compare(a.brand, b.brand) || collator.compare(a.model, b.model));
  }
  function search(rows, query) {
    const tokens = String(query).trim().split(/\s+/).filter(Boolean).map(normalize);
    return rows.filter(row => tokens.every(token => row.search.includes(token)));
  }
  const api = { prepare, search };
  if (typeof module !== 'undefined') module.exports = api;
  else global.ParkingVehicleSearch = api;
})(typeof window === 'undefined' ? globalThis : window);
