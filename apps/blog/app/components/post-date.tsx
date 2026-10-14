export function PostDate({ value }: { value: string }) {
  const date = new Date(value)

  return (
    <time dateTime={date.toISOString()}>
      {new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
        year: 'numeric',
      }).format(date)}
    </time>
  )
}
