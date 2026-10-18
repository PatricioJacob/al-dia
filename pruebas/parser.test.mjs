// Pruebas del parser: node pruebas/parser.test.mjs
import { parsear } from '../app/js/parser.js';
const ahora = new Date(2026, 9, 17, 16, 10); // sábado 17/10/2026 16:10
const f = (d) => d ? `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}` : null;
const casos = [
  ['Pagar factura de luz hoy 20:00', 'Pagar factura de luz', '17/10 20:00'],
  ['pagar luz mañana 20hs', 'Pagar luz', '18/10 20:00'],
  ['Llamar al cliente a las 17:30', 'Llamar al cliente', '17/10 17:30'],
  ['Llamar al cliente a las 5', 'Llamar al cliente', '17/10 17:00'],
  ['comprar pan a las 9', 'Comprar pan', '18/10 9:00'],
  ['turno médico el viernes a las 10', 'Turno médico', '23/10 10:00'],
  ['entregar TP el próximo lunes', 'Entregar TP', '19/10 0:00'],
  ['cumple de Ana el 3 de noviembre', 'Cumple de Ana', '3/11 0:00'],
  ['vencimiento tarjeta 5/11', 'Vencimiento tarjeta', '5/11 0:00'],
  ['sacar la ropa en 30 minutos', 'Sacar la ropa', '17/10 16:40'],
  ['revisar mails en 2 horas', 'Revisar mails', '17/10 18:10'],
  ['regar plantas mañana a la mañana', 'Regar plantas', '18/10 9:00'],
  ['estudiar bases esta noche', 'Estudiar bases', '17/10 21:00'],
  ['pagar alquiler todos los 10', 'Pagar alquiler', '10/11 0:00'],
  ['sacar basura todos los martes 21hs', 'Sacar basura', '20/10 21:00'],
  ['llamar a mamá urgente', 'Llamar a mamá', null],
  ['comprar leche !', 'Comprar leche', null],
  ['ir al banco el sábado', 'Ir al banco', '24/10 0:00'],
  ['reunión a las 8 de la noche', 'Reunión', '17/10 20:00'],
  ['Hacer TP de Exploración de datos', 'Hacer TP de Exploración de datos', null],
  ['tomar mate a las 4 de la tarde pasado mañana', 'Tomar mate', '19/10 16:00'],
  ['backup 8pm', 'Backup', '17/10 20:00'],
];
let ok = 0;
for (const [txt, titulo, fecha] of casos) {
  const r = parsear(txt, ahora);
  const bien = r.titulo === titulo && f(r.fecha) === fecha;
  if (bien) ok++; else console.log('FALLA:', txt, '->', JSON.stringify(r.titulo), f(r.fecha), '| esperado', titulo, fecha);
}
const extra = parsear('sacar basura todos los martes 21hs', ahora);
if (extra.repeticion !== 'semanal') console.log('FALLA repetición'); 
if (!parsear('llamar a mamá urgente', ahora).urgente) console.log('FALLA urgente');
console.log(`${ok}/${casos.length} casos bien`);
