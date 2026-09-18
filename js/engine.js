/* ============================================================
   engine.js — 1v1 battle mechanics, Gen-3/4 style.
   One Pokémon each, no switching: you just got your first one.

   Pure logic. It produces a queue of events; the UI renders them.
   You shouldn't need to edit this.
   ============================================================ */

const rnd  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const roll = (pct) => Math.random() * 100 < pct;

const STAGE_MULT = { "-6":2/8,"-5":2/7,"-4":2/6,"-3":2/5,"-2":2/4,"-1":2/3,"0":1,"1":3/2,"2":4/2,"3":5/2,"4":6/2,"5":7/2,"6":8/2 };
const ACC_STAGE  = { "-6":3/9,"-5":3/8,"-4":3/7,"-3":3/6,"-2":3/5,"-1":3/4,"0":1,"1":4/3,"2":5/3,"3":6/3,"4":7/3,"5":8/3,"6":9/3 };

const STAT_LABEL = { atk:"Attack", def:"Defense", spa:"Sp. Atk", spd:"Sp. Def", spe:"Speed", acc:"accuracy", eva:"evasiveness" };
const STATUS_LABEL = {
  brn:"was burned!", psn:"was poisoned!", par:"is paralysed! It may be unable to move!",
  slp:"fell asleep!", frz:"was frozen solid!", cnf:"became confused!"
};
const STATUS_SHORT = { brn:"BRN", psn:"PSN", par:"PAR", slp:"SLP", frz:"FRZ" };

/* Last resort when every move is out of PP, so a long battle can't soft-lock.
   Typeless (nothing resists it), and it hurts you to use it. */
const STRUGGLE_KEY = "__struggle";
const STRUGGLE = { name:"Struggle", type:"???", cat:"phys", power:50, acc:null, pp:1, priority:0 };
const moveData = key => key === STRUGGLE_KEY ? STRUGGLE : DEX.moves[key];
const struggleSlot = () => ({ key: STRUGGLE_KEY, pp: 1, maxpp: 1 });

function statOf(mon, key) {
  let v = mon.stats[key] * STAGE_MULT[String(mon.stages[key])];
  if (key === "atk" && mon.status === "brn") v *= 0.5;
  if (key === "spe" && mon.status === "par") v *= 0.25;
  return Math.max(1, Math.floor(v));
}

/* Gen-3 damage formula */
function damage(attacker, defender, move) {
  const isPhys = move.cat === "phys";
  const A = statOf(attacker, isPhys ? "atk" : "spa");
  const D = statOf(defender, isPhys ? "def" : "spd");
  const crit = roll(move.highCrit ? 12.5 : 6.25);
  let d = Math.floor(Math.floor(Math.floor((2 * attacker.level) / 5 + 2) * move.power * A / D) / 50) + 2;
  if (crit) d *= 2;
  d = Math.floor(d * rnd(85, 100) / 100);
  if (attacker.types.includes(move.type)) d = Math.floor(d * 1.5);      // STAB
  const eff = effectiveness(move.type, defender.types);
  d = Math.floor(d * eff);
  return { dmg: eff === 0 ? 0 : Math.max(1, d), crit, eff };
}

function accuracyCheck(attacker, defender, move) {
  if (move.acc === null || move.acc === undefined) return true;         // never misses
  const stage = Math.max(-6, Math.min(6, attacker.stages.acc - defender.stages.eva));
  return roll(move.acc * ACC_STAGE[String(stage)]);
}

class Battle {
  constructor(playerMon, foeMon, playerName, foeName) {
    this.player = { mon: playerMon, name: playerName };
    this.foe    = { mon: foeMon,    name: foeName };
    this.events = [];
    this.over = false;
    this.winner = null;
    this.turn = 0;
  }
  me()   { return this.player.mon; }
  them() { return this.foe.mon; }
  log(text) { this.events.push({ t:"text", text }); }
  fx(kind, payload) { this.events.push(Object.assign({ t:kind }, payload)); }
  label(side) { return side === this.foe ? "Foe " : ""; }

  /* ---- AI: score by expected damage against your actual typing,
     with a configurable chance of taking the second-best line. ---- */
  chooseFoeMove() {
    const me = this.them(), you = this.me();
    const usable = me.moves.filter(m => m.pp > 0);
    const canHurt = usable.some(m => moveData(m.key).cat !== "status" && !moveData(m.key).noop);
    if (!usable.length || !canHurt) return { kind: "move", move: struggleSlot() };
    const scored = usable.map(m => {
      const mv = moveData(m.key);
      if (mv.noop) return { m, score: -1 };
      if (mv.cat === "status") {
        // worth it early, pointless once something's already stuck
        const useless = mv.effect && mv.effect.status && you.status;
        return { m, score: useless ? 0 : 18 + rnd(0, 10) };
      }
      const eff = effectiveness(mv.type, you.types);
      const stab = me.types.includes(mv.type) ? 1.5 : 1;
      return { m, score: mv.power * eff * stab * ((mv.acc ?? 100) / 100) };
    }).sort((a, b) => b.score - a.score);

    const misplay = (typeof BATTLE !== "undefined" ? BATTLE.rivalMisplay : 15);
    const pick = (scored.length > 1 && roll(misplay)) ? scored[1].m : scored[0].m;
    return { kind: "move", move: pick };
  }

  applyStatus(target, status, sideLabel) {
    if (status === "cnf") {
      if (target.confusedTurns > 0) return false;
      target.confusedTurns = rnd(2, 5);
      this.log(`${sideLabel}${target.name} ${STATUS_LABEL.cnf}`);
      this.fx("status", { mon: target });
      return true;
    }
    if (target.status) return false;
    if (status === "brn" && target.types.includes("fire")) return false;
    if (status === "frz" && target.types.includes("ice")) return false;
    if (status === "psn" && (target.types.includes("poison") || target.types.includes("steel"))) return false;
    if (status === "par" && target.types.includes("electric")) return false;
    target.status = status;
    if (status === "slp") target.sleepTurns = rnd(1, 3);
    this.log(`${sideLabel}${target.name} ${STATUS_LABEL[status]}`);
    this.fx("status", { mon: target });
    return true;
  }

  applyStage(target, stat, stages, sideLabel) {
    const before = target.stages[stat];
    target.stages[stat] = Math.max(-6, Math.min(6, before + stages));
    if (target.stages[stat] === before) {
      this.log(`${sideLabel}${target.name}'s ${STAT_LABEL[stat]} won't go ${stages > 0 ? "higher" : "lower"}!`);
      return;
    }
    const word = stages > 0 ? (stages > 1 ? "sharply rose" : "rose")
                            : (stages < -1 ? "harshly fell" : "fell");
    this.log(`${sideLabel}${target.name}'s ${STAT_LABEL[stat]} ${word}!`);
  }

  /* returns false if the attacker loses its turn */
  canAct(atkSide) {
    const atk = this.act(atkSide), L = this.label(atkSide);
    if (atk.flinched) { atk.flinched = false; this.log(`${L}${atk.name} flinched!`); return false; }
    if (atk.status === "frz") {
      if (roll(20)) { atk.status = null; this.log(`${L}${atk.name} thawed out!`); }
      else { this.log(`${L}${atk.name} is frozen solid!`); return false; }
    }
    if (atk.status === "slp") {
      if (atk.sleepTurns > 0) { atk.sleepTurns--; this.log(`${L}${atk.name} is fast asleep.`); return false; }
      atk.status = null; this.log(`${L}${atk.name} woke up!`);
    }
    if (atk.status === "par" && roll(25)) { this.log(`${L}${atk.name} is paralysed! It can't move!`); return false; }
    if (atk.confusedTurns > 0) {
      atk.confusedTurns--;
      if (atk.confusedTurns === 0) this.log(`${L}${atk.name} snapped out of its confusion!`);
      else {
        this.log(`${L}${atk.name} is confused!`);
        if (roll(50)) {
          // hurt itself: a 40-power typeless physical hit
          const self = { cat:"phys", power:40, type:"???" };
          const A = statOf(atk, "atk"), D = statOf(atk, "def");
          let d = Math.floor(Math.floor(Math.floor((2 * atk.level) / 5 + 2) * 40 * A / D) / 50) + 2;
          d = Math.max(1, Math.floor(d * rnd(85, 100) / 100));
          atk.hp = Math.max(0, atk.hp - d);
          this.log("It hurt itself in its confusion!");
          this.fx("damage", { side: atkSide === this.player ? "player" : "foe", mon: atk, dmg: d });
          if (atk.hp === 0) this.faint(atkSide);
          return false;
        }
      }
    }
    return true;
  }
  act(side) { return side.mon; }

  useMove(atkSide, defSide, moveSlot) {
    const atk = this.act(atkSide), def = this.act(defSide);
    const mv = moveData(moveSlot.key);
    const aL = this.label(atkSide), dL = this.label(defSide);

    if (!this.canAct(atkSide)) return;

    moveSlot.pp = Math.max(0, moveSlot.pp - 1);
    this.log(`${aL}${atk.name} used ${mv.name}!`);

    if (!accuracyCheck(atk, def, mv)) { this.log(`${aL}${atk.name}'s attack missed!`); return; }

    if (mv.noop) { this.log("But nothing happened!"); return; }

    if (mv.cat === "status") {
      const e = mv.effect || {};
      if (e.status) { if (!this.applyStatus(def, e.status, dL)) this.log("But it failed!"); }
      else if (e.stat) {
        const t = e.target === "self" ? atk : def;
        this.applyStage(t, e.stat, e.stages, e.target === "self" ? aL : dL);
      }
      return;
    }

    const { dmg, crit, eff } = damage(atk, def, mv);
    if (eff === 0) { this.log(`It doesn't affect ${dL}${def.name}...`); return; }
    def.hp = Math.max(0, def.hp - dmg);
    this.fx("damage", { side: defSide === this.player ? "player" : "foe", mon: def, dmg });
    if (crit) this.log("A critical hit!");
    if (eff > 1) this.log("It's super effective!");
    if (eff < 1) this.log("It's not very effective...");

    if (def.hp === 0) { this.faint(defSide); return; }

    const e = mv.effect;
    if (e && e.chance && roll(e.chance)) {
      if (e.status) this.applyStatus(def, e.status, dL);
      else if (e.stat) {
        const t = e.target === "self" ? atk : def;
        this.applyStage(t, e.stat, e.stages, e.target === "self" ? aL : dL);
      }
    }
    if (mv.flinch && roll(mv.flinch)) def.flinched = true;

    if (moveSlot.key === STRUGGLE_KEY) {
      const recoil = Math.max(1, Math.floor(dmg / 4));
      atk.hp = Math.max(0, atk.hp - recoil);
      this.log(`${aL}${atk.name} is hit by recoil!`);
      this.fx("damage", { side: atkSide === this.player ? "player" : "foe", mon: atk, dmg: recoil });
      if (atk.hp === 0) this.faint(atkSide);
    }
  }

  faint(side) {
    const m = this.act(side);
    m.fainted = true; m.status = null; m.confusedTurns = 0;
    this.log(`${this.label(side)}${m.name} fainted!`);
    this.fx("faint", { side: side === this.player ? "player" : "foe", mon: m });
  }

  endOfTurn() {
    for (const side of [this.player, this.foe]) {
      const m = this.act(side);
      if (m.fainted) continue;
      if (m.status === "brn" || m.status === "psn") {
        const chip = Math.max(1, Math.floor(m.max / (m.status === "brn" ? 16 : 8)));
        m.hp = Math.max(0, m.hp - chip);
        this.log(`${this.label(side)}${m.name} is hurt by its ${m.status === "brn" ? "burn" : "poison"}!`);
        this.fx("damage", { side: side === this.player ? "player" : "foe", mon: m, dmg: chip });
        if (m.hp === 0) this.faint(side);
      }
    }
  }

  checkOver() {
    if (this.them().fainted) { this.over = true; this.winner = "player"; }
    else if (this.me().fainted) { this.over = true; this.winner = "foe"; }
    else if (typeof BATTLE !== "undefined" && BATTLE.turnLimit && this.turn >= BATTLE.turnLimit) {
      this.over = true; this.winner = "draw";
    }
    return this.over;
  }

  runTurn(playerAction) {
    this.events = [];
    this.turn++;
    const foeAction = this.chooseFoeMove();

    const order = [
      { side:"player", action: playerAction },
      { side:"foe",    action: foeAction }
    ].sort((a, b) => {
      const pa = moveData(a.action.move.key).priority || 0;
      const pb = moveData(b.action.move.key).priority || 0;
      if (pa !== pb) return pb - pa;
      const sa = statOf(a.side === "player" ? this.me() : this.them(), "spe");
      const sb = statOf(b.side === "player" ? this.me() : this.them(), "spe");
      if (sa !== sb) return sb - sa;
      return roll(50) ? -1 : 1;
    });

    for (const step of order) {
      if (this.checkOver()) break;
      const atkSide = step.side === "player" ? this.player : this.foe;
      const defSide = step.side === "player" ? this.foe : this.player;
      if (this.act(atkSide).fainted) continue;
      this.useMove(atkSide, defSide, step.action.move);
    }

    if (!this.checkOver()) this.endOfTurn();
    this.checkOver();
    return this.events;
  }
}
