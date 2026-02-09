import { zoomService } from '@/shared/lib/zoom/zoom.service';

interface CreateMeetingInput {
  topic: string;
  start_time: string; // ISO 8601 UTC
  duration: number; // minutes
}

interface MeetingResponse {
  meetingId: string;
  joinUrl: string;
  startUrl: string;
}

export const createMeeting = async (input: CreateMeetingInput): Promise<MeetingResponse> => {
  return await zoomService.createMeeting(input);
};
