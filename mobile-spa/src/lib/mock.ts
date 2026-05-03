export const MOCK_CONVERSATIONS = [
  {
    id: 'conv-1',
    projectKey: 'tunaFlow',
    label: 'Mobile Web SPA 설계',
    mode: 'chat',
    type: 'main',
    updatedAt: Date.now() - 1000 * 60 * 5,
  },
  {
    id: 'conv-2',
    projectKey: 'tunaFlow',
    label: 'axum API 검토',
    mode: 'chat',
    type: 'main',
    updatedAt: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    id: 'conv-3',
    projectKey: 'tunaFlow',
    label: 'Tailscale 연동 논의',
    mode: 'chat',
    type: 'main',
    updatedAt: Date.now() - 1000 * 60 * 60 * 24,
  },
]

export const MOCK_MESSAGES = [
  {
    id: 'msg-1',
    role: 'user' as const,
    content: 'mobile-spa Task 01 스캐폴딩을 진행해줘',
    engine: null,
    model: null,
    status: 'done',
    timestamp: Date.now() - 1000 * 60 * 10,
  },
  {
    id: 'msg-2',
    role: 'assistant' as const,
    content: '`mobile-spa/` 디렉토리를 생성하고 Vite + React 프로젝트를 설정했습니다.\n\n```bash\nnpm install\nnpm run dev\n```\n\n**완료된 파일:**\n- `package.json`\n- `vite.config.ts`\n- `tsconfig.json`\n- `index.html`\n- `src/main.tsx`',
    engine: 'claude',
    model: 'claude-sonnet-4-6',
    status: 'done',
    timestamp: Date.now() - 1000 * 60 * 8,
  },
  {
    id: 'msg-3',
    role: 'user' as const,
    content: 'mobile UI를 미리 보고 싶어',
    engine: null,
    model: null,
    status: 'done',
    timestamp: Date.now() - 1000 * 60 * 3,
  },
  {
    id: 'msg-4',
    role: 'assistant' as const,
    content: '미리 보기를 위해 mock 데이터로 UI를 실행합니다. `http://localhost:5174/mobile/` 에서 확인하세요.',
    engine: 'claude',
    model: 'claude-sonnet-4-6',
    status: 'done',
    timestamp: Date.now() - 1000 * 60 * 1,
  },
]

export const MOCK_PLAN = {
  id: 'plan-1',
  title: 'Mobile Web SPA',
  status: 'active',
  phase: 'implementation',
  subtasks: [
    { id: 'st-1', seq: 1, title: 'mobile-spa 프로젝트 스캐폴딩', status: 'done' },
    { id: 'st-2', seq: 2, title: 'HTTP API 클라이언트 레이어', status: 'in_progress' },
    { id: 'st-3', seq: 3, title: '모바일 SPA 핵심 화면 구현', status: 'pending' },
    { id: 'st-4', seq: 4, title: 'axum Static 서빙 추가', status: 'pending' },
  ],
}
