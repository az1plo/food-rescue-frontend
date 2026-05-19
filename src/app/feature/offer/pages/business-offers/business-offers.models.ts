export type OfferEditorMode = 'view' | 'create' | 'edit';
export type OfferEditorStep = 'entry' | 'ai' | 'details' | 'operations';
export type OfferEditorFlowChoice = 'undecided' | 'ai' | 'manual';
export type PickupSchedulePanel = 'date' | 'pickupFrom' | 'pickupTo';
export type PickupTimeFieldName = 'pickupFrom' | 'pickupTo';

export interface PickupCalendarCell {
  date: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
}
