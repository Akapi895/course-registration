import { useCallback, useEffect, useState } from 'react'

export function useRequest<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(null)
    load(controller.signal).then((value) => {
      if (!controller.signal.aborted) setData(value)
    }).catch((cause) => {
      if (!controller.signal.aborted) { setError(cause); setData(undefined) }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [load, revision])
  return { data, loading, error, reload }
}
