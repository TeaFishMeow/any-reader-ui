import type { DocumentCatalogEntry, RepoMeta } from '../../domain'
import { markdownToPlainText } from '../../lib/text'

const now = () => new Date().toISOString()

export const DEMO_REPO_ID = 'demo-calculus'

export const demoDocuments: Array<{
  catalog: DocumentCatalogEntry
  markdown: string
}> = [
  {
    catalog: {
      id: 'multivariable-overview',
      repoId: DEMO_REPO_ID,
      path: '01-overview/multivariable-overview',
      title: '多元函数微分学：问题意识',
      parentId: null,
      childrenIds: ['partial-derivative', 'chain-rule'],
      order: 0,
      level: 1,
      contentVersion: '1',
      contentPlainText: '',
      createdAt: now(),
      updatedAt: now()
    },
    markdown: `# 多元函数微分学：问题意识

当一个量依赖于多个变量时，微分不再只是“斜率”，而是关于局部变化方式的描述。

## 为什么要重新组织阅读

- 读者常常被符号、定位、上下文回忆拖慢。
- 真正重要的是理解：变量之间如何耦合，公式为什么成立，定理在什么前提下工作。
- AnyReader 的目标是把这些 Dirty Work 压到系统层。

> 一段好的解释，应该把符号、对象和动作一一对齐。

设 \(z = f(x, y)\)。如果只改变 \(x\)，并把 \(y\) 固定，我们就在观察一个局部切片。
`
  },
  {
    catalog: {
      id: 'partial-derivative',
      repoId: DEMO_REPO_ID,
      path: '01-overview/partial-derivative',
      title: '偏导数：固定其余变量',
      parentId: 'multivariable-overview',
      childrenIds: [],
      order: 0,
      level: 2,
      contentVersion: '1',
      contentPlainText: '',
      createdAt: now(),
      updatedAt: now()
    },
    markdown: `# 偏导数：固定其余变量

设 \(z = f(x, y)\)。

当我们写

\`\`\`text
∂f/∂x (x0, y0)
\`\`\`

它表示在点 \((x_0, y_0)\) 处，只让 \(x\) 发生微小变化，而把 \(y\) 固定时，函数值的变化率。

## 阅读时常见追问

1. 这里为什么可以把 \(y\) 当成常量？
2. 偏导数和普通导数到底是什么关系？
3. 这个符号与几何图像中的切线、切平面有什么对应？
`
  },
  {
    catalog: {
      id: 'chain-rule',
      repoId: DEMO_REPO_ID,
      path: '01-overview/chain-rule',
      title: '链式法则：把依赖关系展开',
      parentId: 'multivariable-overview',
      childrenIds: [],
      order: 1,
      level: 2,
      contentVersion: '1',
      contentPlainText: '',
      createdAt: now(),
      updatedAt: now()
    },
    markdown: `# 链式法则：把依赖关系展开

若 \(z = f(x, y)\)，且 \(x = x(t), y = y(t)\)，那么 \(z\) 实际上也依赖于 \(t\)。

\`\`\`text
dz/dt = (∂f/∂x)(dx/dt) + (∂f/∂y)(dy/dt)
\`\`\`

这个公式不是“背下来”的对象，而是依赖关系的展开：

- \(f\) 对 \(x\) 的敏感程度
- \(x\) 随 \(t\) 的变化速度
- \(f\) 对 \(y\) 的敏感程度
- \(y\) 随 \(t\) 的变化速度

阅读时最重要的是把每个字母和它代表的对象对上。
`
  }
]

for (const document of demoDocuments) {
  document.catalog.contentPlainText = markdownToPlainText(document.markdown)
}

export const demoRepoMeta: RepoMeta = {
  id: DEMO_REPO_ID,
  title: '微积分演示仓库',
  rootDocumentIds: ['multivariable-overview'],
  currentDocumentId: 'multivariable-overview',
  sourceMode: 'demo',
  createdAt: now(),
  updatedAt: now()
}
