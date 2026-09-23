/** 409 detail from book/cancel → what the athlete reads. One place, shared by Book and class detail. */
export function bookingReason(code: string | undefined): string {
  switch (code) {
    case 'ENTRIES_TOTAL': return $localize`:@@booking.reason.entriesTotal:You've used every class your plan includes for this period.`;
    case 'ENTRIES_PER_MONTH': return $localize`:@@booking.reason.entriesMonth:You've used this month's classes on your plan.`;
    case 'ENTRIES_PER_WEEK': return $localize`:@@booking.reason.entriesWeek:You've used this week's classes on your plan.`;
    case 'ENTRIES_PER_DAY': return $localize`:@@booking.reason.entriesDay:Your plan allows no more classes that day.`;
    case 'CANCELLATIONS_TOTAL': return $localize`:@@booking.reason.cancelTotal:You've used every cancellation your plan allows for this period.`;
    case 'CANCELLATIONS_PER_MONTH': return $localize`:@@booking.reason.cancelMonth:You've used this month's cancellations — talk to your coach.`;
    case 'CANCELLATIONS_PER_WEEK': return $localize`:@@booking.reason.cancelWeek:You've used this week's cancellations — talk to your coach.`;
    case 'CANCELLATIONS_PER_DAY': return $localize`:@@booking.reason.cancelDay:You've used today's cancellations — talk to your coach.`;
    case 'NO_ACTIVE_SUBSCRIPTION': return $localize`:@@booking.reason.noPlan:You need an active plan to book classes.`;
    case 'PAST_CUTOFF': return $localize`:@@booking.reason.pastCutoff:Too late to cancel this class — talk to your coach.`;
    case 'ALREADY_BOOKED': return $localize`:@@booking.reason.alreadyBooked:You're already booked into this class.`;
    case 'CANCELLED': return $localize`:@@booking.reason.cancelled:This class has been cancelled.`;
    case 'PAST': return $localize`:@@booking.reason.past:This class has already started.`;
    default: return $localize`:@@booking.reason.generic:Something went wrong — try again.`;
  }
}
