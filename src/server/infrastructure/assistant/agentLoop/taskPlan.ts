import { z } from 'zod';

const schema = z.object({ steps: z.array(z.object({
  title: z.string().trim().min(1).max(160),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']),
  evidence: z.string().trim().max(600).optional(),
}).strict()).min(1).max(8) }).strict();

/** Per-run state; tool results persist the public checklist in the normal turn history. */
export class TaskPlan {
  private steps: z.infer<typeof schema>['steps'] = [];
  private reminders = 0;
  update(args: unknown): string {
    const parsed = schema.safeParse(args);
    if (!parsed.success) return JSON.stringify({ success: false, error: '计划需包含 1–8 个步骤，每步提供 title、status，可附 evidence。' });
    const steps = parsed.data.steps;
    if (steps.filter(step => step.status === 'in_progress').length > 1) return JSON.stringify({ success: false, error: '仅保留一个当前进行中的步骤。' });
    if (steps.some(step => ['completed', 'blocked'].includes(step.status) && !step.evidence)) return JSON.stringify({ success: false, error: '完成步骤需注明验证结果；受阻步骤需注明具体原因。' });
    this.steps = steps;
    return JSON.stringify({ success: true, plan: steps });
  }
  get incomplete(): string | undefined {
    const remaining = this.steps.filter(step => step.status !== 'completed');
    return remaining.length ? `尚未完成：${remaining.map(step => `${step.title}（${step.status === 'blocked' ? step.evidence : '待完成'}）`).join('；')}` : undefined;
  }
  completionReminder(): string | undefined {
    if (!this.steps.some(step => step.status === 'pending' || step.status === 'in_progress') || this.reminders >= 2) return;
    this.reminders++;
    return `执行清单仍有未完成项：${this.incomplete}。继续完成并验证，再用 update_plan 更新状态；确实受阻时注明原因并标记 blocked。不要仅凭计划声称任务已完成。`;
  }
}
