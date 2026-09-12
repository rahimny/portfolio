import type { ActionKind, HandCommand } from '../scene-interactions/world';
export const EXPRESSIONS = ['scold', 'beckon', 'shrug', 'approve'] as const;
export type ExpressionKind = (typeof EXPRESSIONS)[number];
export type GestureKind = ActionKind | ExpressionKind | 'return';
export interface ActorCommand extends Omit<HandCommand, 'action'> {
  action: GestureKind;
}
export const GESTURES: readonly { value: GestureKind; label: string }[] = [
  { value: 'return', label: 'Tap it home' },
  { value: 'shoot', label: 'Go ham — finger-gun barrage' },
  { value: 'poke', label: 'Poke' },
  { value: 'flick', label: 'Flick' },
  { value: 'scold', label: 'No, no — finger wag' },
  { value: 'beckon', label: 'Come here — beckon' },
  { value: 'shrug', label: 'Really? — palm up' },
  { value: 'approve', label: 'Good — thumbs up' },
];
export function isPhysical(command: ActorCommand): command is HandCommand {
  return (
    command.action === 'shoot' ||
    command.action === 'poke' ||
    command.action === 'flick'
  );
}
