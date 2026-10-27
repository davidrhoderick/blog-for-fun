export type FeatureOptions = {
  id: string
  capture?: boolean
  run?: string
  keep?: number
}

export function parseFeatureOptions(args: string[]): FeatureOptions {
  const result: Omit<FeatureOptions, 'id'> & { id?: string } = {}
  const valueFlags: Record<string, (value: string) => void> = {
    '--id': (value) => (result.id = value),
    '--run': (value) => (result.run = value),
    '--keep': (value) => (result.keep = Number(value)),
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--capture') {
      result.capture = true
      continue
    }
    const setValue = valueFlags[arg]
    if (!setValue) throw new Error(`Unknown argument: ${arg}`)
    const value = args[++index]
    if (!value || value.startsWith('--'))
      throw new Error(`${arg} requires a value`)
    setValue(value)
  }

  if (!result.id) throw new Error('Pass --id <FEATURE_ID>')
  return result as FeatureOptions
}
