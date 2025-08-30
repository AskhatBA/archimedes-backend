import { MISDoctorAvailableSlot, MappedAvailableSlots } from './mis.types';

export const availableSlotsMapper = (slots: MISDoctorAvailableSlot) => {
  return Object.entries(slots).reduce((result: MappedAvailableSlots, slot) => {
    const [key, value] = slot;

    result[key] = {
      date: value.date,
      timeSlots: value.time_slots.map((timeSlot) => ({
        startTime: timeSlot.start_time,
        endTime: timeSlot.end_time,
        available: timeSlot.available,
      })),
    };

    return result;
  }, {});
};
