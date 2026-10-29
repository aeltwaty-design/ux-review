import type { Board } from '../hooks/useBoard';
import { daysBetween, fmtDays, median } from '../lib/format';

export function Kpis({ board }: { board: Board }) {
  const rs = [...board.reviews.values()], fs = [...board.findings.values()];
  const n = (x: number | string) => (board.loaded ? x : '–');
  const openR = rs.filter((r) => r.status === 'requested' || r.status === 'in_progress').length;
  const wait = rs.filter((r) => r.status === 'delivered').length;
  const openF = fs.filter((f) => f.state === 'open');
  const by = { 3: 0, 2: 0, 1: 0 } as Record<number, number>;
  openF.forEach((f) => { by[f.sev] = (by[f.sev] || 0) + 1; });
  const solved = fs.filter((f) => f.state === 'solved').length;
  const pct = fs.length ? Math.round((100 * solved) / fs.length) : 0;
  const durs = rs.map((r) => daysBetween(r.created_at, r.delivered_at)).filter((d): d is number => d != null);
  const med = median(durs);
  return (
    <section className="kpis" aria-label="Summary">
      <Tile n={n(openR)} label="Open requests" cap="requested or in progress" />
      <Tile n={n(wait)} label="Awaiting fixes" cap="findings delivered, not closed" />
      <Tile n={n(openF.length)} label="Open findings" cap={<><b>{by[3]}</b> major · <b>{by[2]}</b> minor · <b>{by[1]}</b> cosmetic</>} />
      <Tile n={<>{n(pct)}<small>%</small></>} label="Solved" cap={`${solved} of ${fs.length} findings`} />
      <Tile n={med == null ? '–' : <>{fmtDays(med)}<small> d</small></>} label="Turnaround" cap={durs.length ? `median request → findings, ${durs.length} ${durs.length === 1 ? 'review' : 'reviews'}` : 'no delivered reviews yet'} />
    </section>
  );
}

function Tile({ n, label, cap }: { n: React.ReactNode; label: string; cap: React.ReactNode }) {
  return <div className="tile"><div className="tile-n">{n}</div><div className="tile-l">{label}</div><div className="tile-c">{cap}</div></div>;
}
