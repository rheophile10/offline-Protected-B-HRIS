import { useState } from "react";
import { useApp, Modal, Field, money, useConfirm, useLiveQuery } from "../ui";
import {
  listCompetitions,
  createCompetition,
  setCompetitionStatus,
  listPipeline,
  addApplicant,
  setApplicationStage,
  deleteApplication,
  convertToOfficer,
  listPositions,
  ranks,
  PIPELINE_STAGES,
  type Competition,
  type PipelineRow,
  type Position,
} from "../lib/hris";

const ACTIVE = PIPELINE_STAGES.filter((s) => s !== "Rejected"); // Applied..Hired (0..5)

export function Recruitment() {
  const { refresh, notify } = useApp();
  const confirm = useConfirm();
  const competitions = useLiveQuery<Competition[]>(listCompetitions, []);
  const pipeline = useLiveQuery<PipelineRow[]>(listPipeline, []);
  const [newComp, setNewComp] = useState(false);
  const [addApp, setAddApp] = useState(false);
  const [converting, setConverting] = useState<PipelineRow | null>(null);

  const byStage = (stage: string) => pipeline.filter((r) => r.stage === stage);

  const move = async (row: PipelineRow, dir: 1 | -1) => {
    const i = ACTIVE.indexOf(row.stage);
    const target = i < 0 ? 0 : Math.min(ACTIVE.length - 1, Math.max(0, i + dir));
    await setApplicationStage(row.id, ACTIVE[target]);
    refresh();
  };
  const reject = async (row: PipelineRow) => { await setApplicationStage(row.id, "Rejected"); refresh(); };
  const reopen = async (row: PipelineRow) => { await setApplicationStage(row.id, "Applied"); refresh(); };
  const remove = async (row: PipelineRow) => {
    if (!confirm(`Remove ${row.applicant_name} from the pipeline?`)) return;
    await deleteApplication(row.id); refresh(); notify("Application removed.", "info");
  };

  return (
    <div className="screen recruit-screen">
      <header className="screen-head row">
        <div>
          <h1>Recruitment</h1>
          <p className="muted">{pipeline.length} applicants across {competitions.length} competition(s)</p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => setNewComp(true)}>+ New competition</button>
          <button className="btn primary" disabled={!competitions.length} onClick={() => setAddApp(true)}>+ Add applicant</button>
        </div>
      </header>

      {competitions.length > 0 && (
        <div className="comp-bar">
          {competitions.map((c) => (
            <div className={"comp-chip" + (c.status !== "Open" ? " closed" : "")} key={c.id}>
              <div>
                <strong>{c.position_title ?? c.position_number}</strong>
                <span className="muted mono"> · {c.position_number}</span>
              </div>
              <div className="muted small">
                {c.applicant_count} applicant(s) · {c.status}
                {c.status === "Open" ? (
                  <button className="linkbtn" onClick={async () => { await setCompetitionStatus(c.id, "Closed"); refresh(); }}>close</button>
                ) : (
                  <button className="linkbtn" onClick={async () => { await setCompetitionStatus(c.id, "Open"); refresh(); }}>reopen</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="kanban">
        {PIPELINE_STAGES.map((stage) => {
          const cards = byStage(stage);
          return (
            <div className={"kcol " + stage.toLowerCase()} key={stage}>
              <div className="kcol-head">
                {stage} <span className="kcount">{cards.length}</span>
              </div>
              <div className="kcol-body">
                {cards.map((row) => (
                  <div className="kcard" key={row.id}>
                    <div className="kname">{row.applicant_name}</div>
                    <div className="muted small">{row.position_title ?? row.position_number}</div>
                    {row.source && <div className="ksource">{row.source}</div>}
                    <div className="kactions">
                      {stage === "Rejected" ? (
                        <button className="icon" title="Reopen" onClick={() => reopen(row)}>↩</button>
                      ) : (
                        <>
                          <button className="icon" title="Back" disabled={ACTIVE.indexOf(stage) <= 0} onClick={() => move(row, -1)}>◀</button>
                          <button className="icon" title="Advance" disabled={ACTIVE.indexOf(stage) >= ACTIVE.length - 1} onClick={() => move(row, 1)}>▶</button>
                          {(stage === "Offer" || stage === "Hired") && (
                            <button className="btn small good" title="Convert to officer" onClick={() => setConverting(row)}>Hire →</button>
                          )}
                          {stage !== "Hired" && <button className="icon danger" title="Reject" onClick={() => reject(row)}>⊘</button>}
                        </>
                      )}
                      <button className="icon danger" title="Remove" onClick={() => remove(row)}>🗑</button>
                    </div>
                  </div>
                ))}
                {cards.length === 0 && <div className="kempty">—</div>}
              </div>
            </div>
          );
        })}
      </div>

      {newComp && <NewCompetition onClose={() => setNewComp(false)} onDone={() => { setNewComp(false); refresh(); notify("Competition opened.", "ok"); }} />}
      {addApp && <AddApplicant competitions={competitions} onClose={() => setAddApp(false)} onDone={() => { setAddApp(false); refresh(); notify("Applicant added.", "ok"); }} />}
      {converting && <ConvertModal row={converting} onClose={() => setConverting(null)} onDone={() => { setConverting(null); refresh(); notify("Applicant hired → officer created.", "ok"); }} />}
    </div>
  );
}

function NewCompetition({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const positions = useLiveQuery<Position[]>(() => listPositions(), []);
  const [pos, setPos] = useState("");
  const [opened, setOpened] = useState(new Date().toISOString().slice(0, 10));
  const [closes, setCloses] = useState("");
  const posVal = pos || positions[0]?.position_number || "";
  const save = async () => {
    if (!posVal) return notify("Pick a position.", "err");
    await createCompetition(posVal, opened, closes);
    onDone();
  };
  return (
    <Modal title="Open a competition" onClose={onClose}>
      <div className="form-grid">
        <Field label="Position">
          <select value={posVal} onChange={(e) => setPos(e.target.value)}>
            {positions.map((p) => <option key={p.position_number} value={p.position_number}>{p.position_number} — {p.title}</option>)}
          </select>
        </Field>
        <Field label="Status"><input value="Open" disabled /></Field>
        <Field label="Opened"><input type="date" value={opened} onChange={(e) => setOpened(e.target.value)} /></Field>
        <Field label="Closes"><input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Open competition</button>
      </div>
    </Modal>
  );
}

function AddApplicant({ competitions, onClose, onDone }: { competitions: Competition[]; onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const open = competitions.filter((c) => c.status === "Open");
  const [comp, setComp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const compVal = comp || open[0]?.id || competitions[0]?.id || "";
  const save = async () => {
    if (!name.trim()) return notify("Name is required.", "err");
    if (!compVal) return notify("Pick a competition.", "err");
    await addApplicant({ name: name.trim(), email: email || null, phone: phone || null, source: source || null, competition_id: compVal });
    onDone();
  };
  return (
    <Modal title="Add applicant" onClose={onClose}>
      <div className="form-grid">
        <Field label="Competition">
          <select value={compVal} onChange={(e) => setComp(e.target.value)}>
            {(open.length ? open : competitions).map((c) => <option key={c.id} value={c.id}>{c.position_title ?? c.position_number}</option>)}
          </select>
        </Field>
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Source" hint="e.g. Job fair, Referral, Website"><input value={source} onChange={(e) => setSource(e.target.value)} /></Field>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Add to pipeline</button>
      </div>
    </Modal>
  );
}

function ConvertModal({ row, onClose, onDone }: { row: PipelineRow; onClose: () => void; onDone: () => void }) {
  const { notify } = useApp();
  const rankList = useLiveQuery<string[]>(ranks, []);
  const [badge, setBadge] = useState<number>(0);
  const [rank, setRank] = useState<string>("");
  const [salary, setSalary] = useState<string>("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const save = async () => {
    if (!badge) return notify("Badge number is required (centrally allocated).", "err");
    try {
      await convertToOfficer(row, badge, rank || null, salary ? Number(salary) : null, start);
      onDone();
    } catch (e) { notify((e as Error).message, "err"); }
  };
  return (
    <Modal title={`Hire ${row.applicant_name}`} onClose={onClose}>
      <p className="muted small">
        Creates an officer and an active assignment to {row.position_title ?? row.position_number}, and marks the
        application Hired.
      </p>
      <div className="form-grid">
        <Field label="Badge number"><input type="number" value={badge || ""} onChange={(e) => setBadge(Number(e.target.value))} /></Field>
        <Field label="Rank">
          <select value={rank} onChange={(e) => setRank(e.target.value)}>
            <option value="">—</option>
            {rankList.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Start date"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Starting salary" hint={salary ? money(Number(salary)) : undefined}>
          <input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
        </Field>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn good" onClick={save}>Hire &amp; create officer</button>
      </div>
    </Modal>
  );
}
