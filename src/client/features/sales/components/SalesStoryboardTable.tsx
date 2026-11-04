import type { buildScriptStoryboard } from '../model/salesScriptStoryboard';
import { commonStoryboardNotes, rowStoryboardNotes, sectionCaption, storyboardColumns, storyboardSections } from '../model/salesScriptStoryboard';
import './salesStoryboardTable.css';

type Rows = ReturnType<typeof buildScriptStoryboard>;

export function SalesStoryboardTable({rows, selected, onSelect}: {rows:Rows; selected?:number; onSelect?:(index:number)=>void}) {
  const common = commonStoryboardNotes(rows);
  const sections = storyboardSections(rows);
  const estimated = rows.filter(row=>row.estimated).length;
  const example = rows.find(row => row.number.endsWith('.2'));
  const timing = estimated === 0 ? '' : estimated === rows.length ? '动作起止时间为估计值。' : '带 ≈ 的时间为估计值。';
  return <div className="script-reading">
    {(example || timing) && <p className="script-timing-note">{example && `${example.number} 表示第 ${example.segments[0].address.shot + 1} 个镜头的第 2 段动作。 `}{timing}</p>}
    {common.length > 0 && <dl className="script-common-notes">{common.map(note=><div key={note.label}><dt>全片{note.label}</dt><dd>{note.text}</dd></div>)}</dl>}
    <div className="script-table-scroll"><table aria-label={onSelect ? "动作分镜表" : "动作素材分镜表"}>
      <colgroup><col className="script-id-col"/><col className="script-time-col"/><col/><col className="script-camera-col"/></colgroup>
      <thead><tr>{storyboardColumns.map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
      {sections.map((section, sectionIndex)=><tbody key={section.rows[0].number}>
        {(section.label || sections.length > 1) && <tr className="script-section-row"><th scope="rowgroup" colSpan={4}>{sectionCaption(section,sectionIndex)}</th></tr>}
        {section.rows.map(row=>{
          const i = row.index - 1;
          const notes = rowStoryboardNotes(row,common);
          return <tr key={row.number} className={selected === i ? 'is-current' : undefined} onClick={onSelect && (()=>onSelect(i))}>
            <th scope="row">{onSelect ? <button aria-label={'定位分镜 '+row.number} aria-pressed={selected === i}
              onClick={event=>{event.stopPropagation();onSelect(i);}}>{row.number}</button> : row.number}</th>
            <td className="script-time"><strong>{row.duration} 秒</strong><small>{estimated < rows.length && row.estimated ? '≈ ' : ''}{row.range}</small></td>
            <td><span>{row.action}</span>{notes.length > 0 && <dl className="script-row-notes">{notes.map(note=>
              <div key={note.label}><dt>{note.label}</dt><dd>{note.text}</dd></div>)}</dl>}</td>
            <td>{row.camera}</td>
          </tr>;
        })}
      </tbody>)}
    </table></div>
  </div>;
}
