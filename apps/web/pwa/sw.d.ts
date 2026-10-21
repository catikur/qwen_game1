/**
 * `sw.js` bir şablon, modül değil: derleme eklentisi onu metin olarak okuyor,
 * testler de metin olarak içe aktarıyor (`with { type: 'text' }`). Tip
 * denetimi bu yüzden onu bir dizgi olarak görüyor.
 */
declare const template: string;
export default template;
