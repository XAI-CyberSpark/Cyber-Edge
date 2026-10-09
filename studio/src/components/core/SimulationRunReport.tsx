import { uiText, useUiLanguage  } from '@/i18n';
import { formatDuration, type SimulationReport } from '@/domain/simulationReport';
const statuses = { completed: '链路执行完成', failed: '链路执行失败', waiting: '等待下一次输入', paused: '流程已暂停' };
export function SimulationRunReport({ report }: { report: SimulationReport }) {
  useUiLanguage();
  return <section className="simulation-report" aria-label={uiText("链路验证结果")}>
    <strong className={`type-label simulation-report-status is-${report.status}`}>{uiText(report.nodes.some(node => node.error?.includes('执行已取消')) ? uiText("本次运行已取消") : statuses[report.status])}</strong>
    {report.nodes.filter(node => node.status === 'failed').map((node, i) => <p role="alert" className="type-body" key={`failure-${i}`}>{uiText(node.label)}: {uiText(node.error || uiText("执行失败"))}</p>)}
    <dl className="simulation-report-metrics">
      <div><dt>{uiText("本次总耗时")}</dt><dd>{uiText(formatDuration(report.durationMs))}</dd></div>
      <div><dt>{uiText("节点执行")}</dt><dd>{uiText(report.completed)} {uiText("完成 ·")}{uiText(report.failed)} {uiText("失败")}</dd></div>
    </dl>
    {report.observations.map(text => <p key={text}>{uiText(text)}</p>)}
    <div className="simulation-report-models"><h3 className="type-label">{uiText("模型调用")}</h3>
      {report.models.length ? report.models.map((model, i) => <div key={i}><strong className="type-label">{uiText(model.model)}</strong><p>{uiText(model.node)}</p><p>{uiText("请求耗时")}{uiText(formatDuration(model.durationMs))} · Token {uiText(model.tokens ?? uiText("未采集"))}</p></div>) : <p>{uiText("本次无已采集的模型调用指标")}</p>}
      <p className="simulation-report-note">{uiText("耗时含请求往返；单次运行不代表模型准确率。")}</p>
    </div>
    {report.nodes.length > 0 && <details><summary>{uiText("节点执行详情")}</summary><ol>{report.nodes.map((node, i) => <li key={i}><span>{uiText(node.label)}</span><span>{uiText(node.status === 'completed' ? uiText("完成") : node.status === 'failed' ? uiText("失败") : uiText("未完成"))} · {uiText(formatDuration(node.durationMs))}</span>{node.error && <p role="alert">{uiText(node.error)}</p>}</li>)}</ol></details>}
    {report.hmi.length > 0 && <details><summary>{uiText("HMI 输出记录")}</summary>{report.hmi.map((text, i) => <p key={i}>{text}</p>)}<p>{uiText("此处记录输出文字，不代表音频播放结果。")}</p></details>}
    <p className="simulation-report-note">{uiText("行为仿真 · 执行完成不等于业务验收通过")}</p>
    <small className="simulation-report-id">{uiText(report.runId)}</small>
  </section>;
}
