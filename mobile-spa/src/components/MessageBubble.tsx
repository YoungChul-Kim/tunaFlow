import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  role: 'user' | 'assistant'
  content: string
  engine?: string | null
  model?: string | null
  status?: string
}

export function MessageBubble({ role, content, engine, model, status }: Props) {
  if (role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm">
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start mb-3">
      <div className="max-w-[85%]">
        {(engine || model) && (
          <div className="flex gap-1.5 mb-1 ml-1">
            {engine && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                {engine}
              </span>
            )}
            {model && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                {model.split('-').slice(-2).join('-')}
              </span>
            )}
          </div>
        )}
        <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100">
          {status === 'running' ? (
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({ children, className }) => {
                  const isBlock = className?.includes('language-')
                  return isBlock ? (
                    <pre className="bg-zinc-900 dark:bg-zinc-950 text-zinc-100 rounded-lg p-3 overflow-x-auto text-xs my-2">
                      <code>{children}</code>
                    </pre>
                  ) : (
                    <code className="bg-zinc-200 dark:bg-zinc-700 px-1 py-0.5 rounded text-xs font-mono">
                      {children}
                    </code>
                  )
                },
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  )
}
