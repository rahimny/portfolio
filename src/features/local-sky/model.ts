const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function skyPosition(fraction: number) {
  return {
    x: 18 + fraction * 204,
    y: 65 + Math.cos(fraction * Math.PI * 2) * 36,
  };
}

export function londonSky(date: Date) {
  const time = clock.format(date);
  const [hour, minute] = time.split(':').map(Number);
  const fraction = (hour + minute / 60) / 24;
  return {
    time,
    fraction,
    ...skyPosition(fraction),
    period:
      hour < 5 || hour >= 22
        ? 'Night'
        : hour < 12
          ? 'Morning'
          : hour < 18
            ? 'Afternoon'
            : 'Evening',
  };
}
