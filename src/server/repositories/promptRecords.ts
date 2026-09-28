import { db } from './access';

export const promptRecordRepository = {
  listRecent: (limit: number) => db.promptRecord.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
  create: (data: {
    productId: string | null;
    productTitle: string;
    productFingerprint: string;
    modelUsed: string;
    styleName: string;
    promptsJson: string;
  }) => db.promptRecord.create({ data }),
  deleteById: (id: string) => db.promptRecord.delete({ where: { id } }),
  saveAnalysis: (data: {
    productTitle: string;
    productFingerprint: string;
    modelUsed: string;
    styleName: string;
    promptsJson: string;
  }) => db.promptRecord.create({ data }),
};
