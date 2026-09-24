import { collectProduct } from '../../services/collect/collectProduct';

export async function POST(req: Request) {
  return collectProduct(req);
}
