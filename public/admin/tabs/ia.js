// Panel Diwilo · pestaña «IA». Es el módulo transversal de Diwilo Modulos: la MISMA página que ven todas las apps (agentes, IA Diwilo,
// consumo, conversaciones y ajustes del chat, conexiones y API, y —solo aquí— Modelo de IA). Sin barras ni pestañas propias del panel.
Admin.tab('ia', (A) => {
  const { $ } = A;
  const load = () => { const f = $('#iaFrame'); if (!f.getAttribute('src')) f.src = '/admin/m/ai?org=diwilo'; };
  return { show: load, hide: () => {} };
});
