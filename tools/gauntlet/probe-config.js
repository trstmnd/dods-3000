/* Branchement de DODS 3000 sur le shim de hearth-probe (echoo19/hearth, MIT).
 * Ce fichier n'est JAMAIS livre avec le jeu : run.sh l'injecte seulement dans la copie
 * servie au gauntlet, apres probe-shim.js. Il lit window.__dods de l'exterieur, a 20 Hz,
 * et annonce les moments du saut comme evenements : les detecteurs de hearth (ecran noir,
 * crash, blocage, jeu qui ne repond plus) disent alors a quel moment ils ont vu le defaut.
 */
(function () {
  'use strict';
  var P = window.__hearthProbe;
  if (!P) return;
  var screen = function () {
    var on = document.querySelector('.screen.on');
    return on ? on.id.replace('s-', '') : 'aucun';
  };
  P.configure({
    // Un seul geste : appuyer, tenir, lacher (Espace, que hearth appelle jump). Les fleches
    // pilotent la planche.
    actions: ['jump', 'up', 'down'],
    scene: function () {
      var d = window.__dods;
      return screen() + (d && d.state && d.state.spot ? ':' + d.state.spot.id : '');
    },
    entities: function () {
      var d = window.__dods, j = d && d.jump;
      if (!j) return [];
      return [
        { id: 'plongeur', name: 'plongeur', tags: ['player'], x: j.pos.z, y: j.pos.y, alive: !(j.result && j.result.dead) },
        { id: 'eau', name: 'eau', tags: ['objective'], x: j.pos.z + 6, y: 0, alive: true }
      ];
    },
    listStates: function () {
      var d = window.__dods;
      return (d ? d.spots : []).map(function (s) { return { id: s.id, label: s.name + ' (' + s.height + ' m)' }; });
    },
    enterState: function (id) {
      var d = window.__dods;
      var s = d.spots.filter(function (x) { return x.id === id; })[0];
      if (s) { d.state.spot = s; d.startRun(); }
    },
    reset: function () { window.__dods.show('title'); }
  });
  var last = { screen: '', state: '', grade: '' };
  setInterval(function () {
    var d = window.__dods, j = d && d.jump;
    var s = screen();
    if (s !== last.screen) { P.emit('ecran:' + s); last.screen = s; }
    if (!j) return;
    if (j.state !== last.state) { P.emit('saut:' + j.state); last.state = j.state; }
    var g = j.grade ? j.grade.key : '';
    if (g && g !== last.grade) { P.emit('note:' + g); }
    last.grade = g;
  }, 50);
})();
