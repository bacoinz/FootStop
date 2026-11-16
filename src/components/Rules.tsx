import { motion } from "motion/react";
import { X } from "lucide-react";
import { useI18n } from "../lib/i18n.tsx";

function RulesPt() {
  return (
    <>
      <p>
        O círculo central roda e sorteia uma <b>letra</b> ou uma <b>categoria</b>; 6 segundos depois começa. À vez, cada jogador escreve um futebolista que sirva e carrega
        em <b>Enter</b>. Não há tempo para pensar: é o dedo mais rápido!
      </p>
      <h3>O relógio</h3>
      <ul>
        <li>Cada um começa a ronda com 30 s, 45 s ou 1 minuto. O teu relógio só desconta na tua vez.</li>
        <li>Nome certo: <b>+2 s</b> e a vez passa logo para o próximo, com o relógio dele já a contar.</li>
        <li>Nome errado: tenta outra vez (o relógio não para).</li>
        <li>Passar (ou Esc): <b>−5 s</b> e a vez passa.</li>
        <li>Sem tempo, estás fora da ronda. O último a resistir ganha.</li>
      </ul>
      <h3>Nomes</h3>
      <ul>
        <li>Nome e apelido, só o apelido ou a alcunha: «Lionel Messi», «Messi», «Pepe», «Deco», «CR7».</li>
        <li>Letra: vale se o nome próprio ou o apelido começar por ela («Lionel Messi» serve para L e para M; «Messi» só para M). Só o nome próprio («Lionel») não vale.</li>
        <li>Uma gralha de uma só letra é perdoada («Mesi» vale como Messi). Nomes incompletos não são completados: «Manu» não vale como Manuel Neuer.</li>
        <li>Se o nome for vago («Silva», «Tiago»), aparecem até 3 opções: escolhe a certa (clique ou teclas 1 a 3). Só uma serve para a ronda.</li>
        <li>Não se pode repetir um jogador na mesma ronda. Noutra ronda, pode.</li>
      </ul>
      <h3>Pontos</h3>
      <ul>
        <li>Com N jogadores, o 1.º da ronda ganha N−1 pontos, o 2.º N−2… e o último 0.</li>
        <li>Quem fica em último recebe um <b>trunfo</b> para a ronda seguinte (preenche um nome por ti) e começa a jogar.</li>
        <li>Empate no fim: <b>morte súbita</b> com 15 segundos e sem segundos de bónus.</li>
      </ul>
      <h3>A solo</h3>
      <ul>
        <li>Começas com 1, 3 ou 5 rondas. Perdes uma quando erras um nome, passas ou o tempo acaba.</li>
        <li>Conta quantos nomes consegues até ficares sem rondas.</li>
      </ul>
      <p className="muted small">Os dados vêm da Wikidata. Nomes que não estejam na base são confirmados na Wikidata na hora (o relógio para enquanto isso).</p>
    </>
  );
}

function RulesEn() {
  return (
    <>
      <p>
        The centre circle spins and draws a <b>letter</b> or a <b>category</b>; 6 seconds later the round starts. Taking turns, each player types a footballer who fits
        and presses <b>Enter</b>. No time to think: fastest finger wins!
      </p>
      <h3>The clock</h3>
      <ul>
        <li>Everyone starts the round with 30 s, 45 s or 1 minute. Your clock only runs on your turn.</li>
        <li>Right name: <b>+2 s</b> and the turn goes straight to the next player, whose clock is already running.</li>
        <li>Wrong name: try again (the clock doesn't stop).</li>
        <li>Pass (or Esc): <b>−5 s</b> and the turn moves on.</li>
        <li>Out of time, you're out of the round. The last one standing wins.</li>
      </ul>
      <h3>Names</h3>
      <ul>
        <li>First name and surname, just the surname, or the nickname: “Lionel Messi”, “Messi”, “Pepe”, “Deco”, “CR7”.</li>
        <li>Letter rounds: the first name or the surname must start with it (“Lionel Messi” works for L and M; “Messi” only for M). A first name alone (“Lionel”) doesn't count.</li>
        <li>One wrong letter is forgiven (“Mesi” counts as Messi). Incomplete names are never completed: “Manu” doesn't count as Manuel Neuer.</li>
        <li>If a name is vague (“Silva”, “Tiago”), up to 3 options show up: pick the right one (click or keys 1 to 3). Only one fits the round.</li>
        <li>The same player can't be said twice in a round. In another round, they can.</li>
      </ul>
      <h3>Points</h3>
      <ul>
        <li>With N players, 1st in the round gets N−1 points, 2nd N−2… and last gets 0.</li>
        <li>Whoever finishes last gets a <b>trump card</b> for the next round (it fills in a name for you) and starts it.</li>
        <li>Tied at the end: <b>sudden death</b> with 15 seconds and no bonus seconds.</li>
      </ul>
      <h3>Solo</h3>
      <ul>
        <li>You start with 1, 3 or 5 rounds. You lose one for a wrong name, a pass or running out of time.</li>
        <li>See how many names you get before you run out of rounds.</li>
      </ul>
      <p className="muted small">The data comes from Wikidata. Names that aren't in the database are checked on Wikidata on the spot (the clock stops meanwhile).</p>
    </>
  );
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  const { lang, t } = useI18n();
  return (
    <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="paper modal" initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>{t.howToPlay}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={lang === "pt" ? "Fechar" : "Close"}>
            <X size={22} />
          </button>
        </div>
        {lang === "pt" ? <RulesPt /> : <RulesEn />}
      </motion.div>
    </motion.div>
  );
}
