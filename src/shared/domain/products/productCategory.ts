/**
 * 电商多品类与解剖学部位智能解析与路由器
 * 
 * 模块结构说明：
 * - ./product-category/defs: 品类标识符、子类定义与预设字典
 * - ./product-category/infer: 商品大类与穿戴部位推断、特写微距光学提示词
 * - ./product-category/subcategoryStore: 二级类目持久化、批量文本导入与局部聚类算法
 * - ./product-category/anatomy: 动作分类提取、解剖学部位锚点与 UI 徽章解析
 */

// 1. 基础类型与常量定义
export * from './product-category/defs';

// 2. 核心大类与近景光学推断
export * from './product-category/infer';

// 3. 子类目持久化存储与聚类
export * from './product-category/subcategoryStore';

// 4. 解剖学部位、动作锚点与徽章解析
export * from './product-category/anatomy';

// 5. 本地类目迁到服务端的预览合并
export * from './product-category/migrationPreview';
export * from './product-category/serverCache';
