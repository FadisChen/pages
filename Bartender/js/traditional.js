import OpenCC from '../vendor/opencc-cn2t.js';

const convert = OpenCC.Converter({ from: 'cn', to: 't' });

export function toTraditionalChinese(value) {
  return convert(String(value ?? ''));
}
