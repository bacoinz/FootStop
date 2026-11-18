// Interface language: every string the screens show, in Portuguese and English.
// The server's messages come in both languages already (shared/i18n.ts); `tr` picks one.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Family } from "../../shared/categories.ts";
import type { Lang, Text } from "../../shared/i18n.ts";

const pt = {
  // Home
  tagline: "O Stop do futebol: sai uma letra ou uma categoria e cada um diz um jogador antes que o relógio acabe.",
  yourName: "O teu nome",
  namePlaceholder: "Ex.: Mister",
  createRoom: "Criar sala",
  playSolo: "Jogar sozinho",
  orJoin: "ou entra numa sala",
  code: "CÓDIGO",
  roomCode: "Código da sala",
  join: "Entrar",
  howToPlay: "Como jogar",
  support: "Apoiar no Ko-fi",
  enjoyedIt: "Gostaste do jogo? O Footstop é grátis e sem anúncios chatos.",
  foundBug: "Encontraste um bug?",
  otherGames: "Vê os meus outros jogos e apps",
  language: "Idioma",

  // Top bar and room
  leave: "Sair",
  leaveRoom: "Sair da sala",
  solo: "A solo",
  room: "Sala",
  connecting: "a ligar…",
  soundOn: "Ligar som",
  soundOff: "Desligar som",
  cantJoin: "Não foi possível entrar",
  backHome: "Voltar ao início",
  entering: (solo: boolean, code: string) => (solo ? "A entrar no jogo…" : `A entrar na sala ${code}…`),
  yourTurnTitle: "A tua vez! · Footstop",

  // Lobby
  modeMixed: "Misto",
  modeLetters: "Letras",
  modeCategories: "Categorias",
  options: "Opções",
  hostPicks: "o anfitrião escolhe",
  secondsLabel: "Segundos de cada jogador por ronda",
  livesLabel: "Rondas (perdes uma a cada erro)",
  roundsLabel: "Rondas",
  modeLabel: "Tipo de rondas",
  soloGame: "Jogo a solo",
  soloHeadline: "Quantos nomes consegues?",
  soloIntro: "Cada nome certo vale 1 ponto e +2 s. Um erro, um passe ou o tempo a acabar custam uma ronda.",
  startGame: "Começar jogo",
  copied: "Link copiado!",
  copyLink: "Copiar link para o Discord",
  players: "Jogadores",
  you: "(tu)",
  offline: "desligado",
  host: "anfitrião",
  kick: "Expulsar",
  needTwo: "Partilha o link: são precisos pelo menos 2 jogadores.",
  waitingHost: "À espera que o anfitrião comece o jogo…",

  // Round
  family: {
    letter: "Letra",
    club: "Clube",
    period: "Clube e época",
    country: "País",
    national: "Seleção",
    position: "Posição",
    decade: "Década",
    career: "Carreira",
  } as Record<Family, string>,
  suddenDeath: "Morte súbita",
  roundN: (n: number) => `Ronda ${n}`,
  roundNofM: (n: number, m: number) => `Ronda ${n} de ${m}`,
  livesLeft: (left: number, total: number) => `${left} de ${total} rondas`,
  letterHint: "Nome próprio ou apelido",
  draw: "Sorteio",
  spinning: "A rodar…",
  names: (n: number) => `${n} ${n === 1 ? "nome" : "nomes"}`,
  out: "FORA",
  yourTurnBoard: "A TUA VEZ",
  time: "TEMPO",
  outShort: "fora",
  table: "Classificação",
  pointsTitle: "Pontos",
  namesTitle: "Nomes inseridos",
  namesCol: "Nomes",
  hasTrump: "Tem um trunfo para esta ronda",
  youStart: "Começas tu!",
  starts: (name: string) => `Começa ${name}`,
  nextRound: "Entras na próxima ronda",
  youreOut: (name: string) => `Estás fora · vez de ${name}`,
  typePlayer: "Escreve um futebolista…",
  turnOf: (name: string) => `Vez de ${name}`,
  itsYourTurn: "É a tua vez!",
  isPlaying: (name: string) => `${name} está a jogar`,
  playerName: "Nome do futebolista",
  checking: (text: string) => `A confirmar «${text}» na Wikidata (relógio parado)`,
  didYouMean: "Querias dizer…",
  notValid: "Não vale",
  giveUp: "Desistir da ronda",
  pass: (s: number) => `Passar (−${s} s)`,
  trump: "Trunfo",
  trumpHint: "Preenche um nome por ti (só nesta ronda)",
  trumpOf: (name: string) => `Trunfo de ${name}:`,
  passed: (name: string, s: number) => `${name} passou (−${s} s)`,
  ranOut: (name: string) => `${name} ficou sem tempo!`,
  choosing: (name: string) => `${name} está a escolher…`,

  // Round end and game end
  timeUp: "Acabou o tempo!",
  gaveUp: "Desististe da ronda.",
  wrongName: "Nome errado.",
  roundLost: "Ronda perdida.",
  letterX: (l: string) => `Letra ${l}`,
  soloRoundSummary: (round: number, total: number) => `${round} ${round === 1 ? "nome" : "nomes"} nesta ronda · ${total} no total`,
  roundsLeft: (n: number) => (n === 0 ? "Sem rondas: fim de jogo!" : n === 1 ? "Resta 1 ronda" : `Restam ${n} rondas`),
  isChampion: "é o campeão!",
  winsRound: "ganha a ronda!",
  roundOver: "Fim da ronda",
  namesSaid: (n: number) => `${n} ${n === 1 ? "nome dito" : "nomes ditos"}`,
  roundsToPlay: (n: number) => `${n} rondas por jogar`,
  lastRound: "última ronda",
  tieAhead: "Empate no topo! Vem aí a morte súbita…",
  continue: "Continuar",
  nextRoundBtn: "Próxima ronda",
  nextSoon: "A próxima ronda começa daqui a pouco…",
  playAgain: "Jogar outra vez",
  gameOver: "Fim de jogo",
  nameWord: (n: number): string => (n === 1 ? "nome" : "nomes"),
  newRecord: "Novo recorde!",
  record: (n: number) => `Recorde: ${n}`,
  soloSettings: (s: number, lives: number, mode: string) => `${s} s · ${lives} ${lives === 1 ? "ronda" : "rondas"} · ${mode}`,
  modeName: { mixed: "misto", letters: "letras", categories: "categorias" } as Record<string, string>,
  finalTable: "Classificação final",
  statsTitle: "Estatísticas e curiosidades",
  pts: "pts",

  // League table
  pos: "Pos",
  player: "Jogador",
  roundsWon: "Rondas ganhas",
  rw: "RG",
  form: "Forma",
  formTitle: "Posições nas últimas rondas",

  sessionElsewhere: "Sessão aberta noutro separador.",
};

type Dict = typeof pt;

const en: Dict = {
  tagline: "Stop, the football edition: a letter or a category comes up, and everyone names a player before their clock runs out.",
  yourName: "Your name",
  namePlaceholder: "E.g. Gaffer",
  createRoom: "Create room",
  playSolo: "Play solo",
  orJoin: "or join a room",
  code: "CODE",
  roomCode: "Room code",
  join: "Join",
  howToPlay: "How to play",
  support: "Support on Ko-fi",
  enjoyedIt: "Enjoyed the game? Footstop is free and has no annoying ads.",
  foundBug: "Found a bug?",
  otherGames: "See my other games and apps",
  language: "Language",

  leave: "Leave",
  leaveRoom: "Leave the room",
  solo: "Solo",
  room: "Room",
  connecting: "connecting…",
  soundOn: "Sound on",
  soundOff: "Sound off",
  cantJoin: "Couldn't join",
  backHome: "Back to start",
  entering: (solo: boolean, code: string) => (solo ? "Starting the game…" : `Joining room ${code}…`),
  yourTurnTitle: "Your turn! · Footstop",

  modeMixed: "Mixed",
  modeLetters: "Letters",
  modeCategories: "Categories",
  options: "Options",
  hostPicks: "the host decides",
  secondsLabel: "Seconds per player each round",
  livesLabel: "Rounds (you lose one per mistake)",
  roundsLabel: "Rounds",
  modeLabel: "Round type",
  soloGame: "Solo game",
  soloHeadline: "How many names can you get?",
  soloIntro: "Each right name is 1 point and +2 s. A wrong name, a pass or running out of time costs a round.",
  startGame: "Start game",
  copied: "Link copied!",
  copyLink: "Copy link for Discord",
  players: "Players",
  you: "(you)",
  offline: "offline",
  host: "host",
  kick: "Kick",
  needTwo: "Share the link: you need at least 2 players.",
  waitingHost: "Waiting for the host to start the game…",

  family: {
    letter: "Letter",
    club: "Club",
    period: "Club and era",
    country: "Country",
    national: "National team",
    position: "Position",
    decade: "Decade",
    career: "Career",
  },
  suddenDeath: "Sudden death",
  roundN: (n) => `Round ${n}`,
  roundNofM: (n, m) => `Round ${n} of ${m}`,
  livesLeft: (left, total) => `${left} of ${total} rounds`,
  letterHint: "First name or surname",
  draw: "Draw",
  spinning: "Spinning…",
  names: (n) => `${n} ${n === 1 ? "name" : "names"}`,
  out: "OUT",
  yourTurnBoard: "YOUR TURN",
  time: "TIME",
  outShort: "out",
  table: "Table",
  pointsTitle: "Points",
  namesTitle: "Names given",
  namesCol: "Names",
  hasTrump: "Has a trump card for this round",
  youStart: "You start!",
  starts: (name) => `${name} starts`,
  nextRound: "You join next round",
  youreOut: (name) => `You're out · ${name}'s turn`,
  typePlayer: "Type a footballer…",
  turnOf: (name) => `${name}'s turn`,
  itsYourTurn: "Your turn!",
  isPlaying: (name) => `${name} is playing`,
  playerName: "Footballer's name",
  checking: (text) => `Checking “${text}” on Wikidata (clock stopped)`,
  didYouMean: "Did you mean…",
  notValid: "Doesn't count",
  giveUp: "Give up the round",
  pass: (s) => `Pass (−${s} s)`,
  trump: "Trump",
  trumpHint: "Fills in a name for you (this round only)",
  trumpOf: (name) => `${name}'s trump card:`,
  passed: (name, s) => `${name} passed (−${s} s)`,
  ranOut: (name) => `${name} ran out of time!`,
  choosing: (name) => `${name} is choosing…`,

  timeUp: "Time's up!",
  gaveUp: "You gave up the round.",
  wrongName: "Wrong name.",
  roundLost: "Round lost.",
  letterX: (l) => `Letter ${l}`,
  soloRoundSummary: (round, total) => `${round} ${round === 1 ? "name" : "names"} this round · ${total} in total`,
  roundsLeft: (n) => (n === 0 ? "No rounds left: game over!" : n === 1 ? "1 round left" : `${n} rounds left`),
  isChampion: "is the champion!",
  winsRound: "wins the round!",
  roundOver: "Round over",
  namesSaid: (n) => `${n} ${n === 1 ? "name said" : "names said"}`,
  roundsToPlay: (n) => `${n} rounds to go`,
  lastRound: "last round",
  tieAhead: "Tied at the top! Sudden death is coming…",
  continue: "Continue",
  nextRoundBtn: "Next round",
  nextSoon: "The next round starts in a moment…",
  playAgain: "Play again",
  gameOver: "Game over",
  nameWord: (n) => (n === 1 ? "name" : "names"),
  newRecord: "New record!",
  record: (n) => `Record: ${n}`,
  soloSettings: (s, lives, mode) => `${s} s · ${lives} ${lives === 1 ? "round" : "rounds"} · ${mode}`,
  modeName: { mixed: "mixed", letters: "letters", categories: "categories" },
  finalTable: "Final table",
  statsTitle: "Stats and fun facts",
  pts: "pts",

  pos: "Pos",
  player: "Player",
  roundsWon: "Rounds won",
  rw: "RW",
  form: "Form",
  formTitle: "Places in the last rounds",

  sessionElsewhere: "Opened in another tab.",
};

const DICTS: Record<Lang, Dict> = { pt, en };
const KEY = "fst.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "pt" || saved === "en") return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith("pt") ? "pt" : "en";
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
  /** Picks this language from a server message. */
  tr: (text: Text | undefined | null) => string;
}

const Ctx = createContext<I18n | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-PT" : "en";
  }, [lang]);
  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang: (l) => {
        try {
          localStorage.setItem(KEY, l);
        } catch {}
        setLangState(l);
      },
      t: DICTS[lang],
      tr: (text) => (text ? (text[lang] ?? text.pt) : ""),
    }),
    [lang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside LangProvider");
  return v;
}

export type { Dict };
