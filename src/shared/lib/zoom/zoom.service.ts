import axios from 'axios';

import { config } from '@/config';

import {
  CreateMeetingInput,
  MeetingOutput,
  ZoomMeetingResponse,
  ZoomAccessToken,
} from './zoom.types';

class ZoomService {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  private readonly accountId: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl: string;
  private readonly apiUrl: string;

  constructor() {
    if (!config.zoom.accountId || !config.zoom.clientId || !config.zoom.clientSecret) {
      throw new Error(
        'Zoom credentials not configured. Check ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET'
      );
    }

    this.accountId = config.zoom.accountId;
    this.clientId = config.zoom.clientId;
    this.clientSecret = config.zoom.clientSecret;
    this.tokenUrl = config.zoom.tokenUrl;
    this.apiUrl = config.zoom.apiUrl;
  }

  /**
   * Obtains a Zoom access token using Server-to-Server OAuth
   * Caches the token in memory until expiration
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid (with 60s buffer)
    if (this.accessToken && this.tokenExpiresAt > now + 60000) {
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await axios.post<ZoomAccessToken>(this.tokenUrl, null, {
        params: {
          grant_type: 'account_credentials',
          account_id: this.accountId,
        },
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = now + response.data.expires_in * 1000;

      return this.accessToken;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Zoom OAuth error:', {
          status: error.response?.status,
          data: error.response?.data,
        });
        throw new Error(
          `Failed to obtain Zoom access token: ${error.response?.data?.reason || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Creates a Zoom meeting
   * @param input - Meeting configuration (topic, start_time, duration)
   * @returns Meeting details (meetingId, joinUrl, startUrl)
   */
  async createMeeting(input: CreateMeetingInput): Promise<MeetingOutput> {
    const accessToken = await this.getAccessToken();

    try {
      const response = await axios.post<ZoomMeetingResponse>(
        `${this.apiUrl}/users/me/meetings`,
        {
          topic: input.topic,
          type: 2, // Scheduled meeting
          start_time: input.start_time,
          duration: input.duration,
          timezone: 'UTC',
          settings: {
            waiting_room: true,
            join_before_host: false,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        meetingId: response.data.id.toString(),
        joinUrl: response.data.join_url,
        startUrl: response.data.start_url,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Zoom API error:', {
          status: error.response?.status,
          data: error.response?.data,
        });

        // Handle token expiration
        if (error.response?.status === 401) {
          this.accessToken = null;
          this.tokenExpiresAt = 0;
          throw new Error('Zoom authentication failed. Token may have expired.');
        }

        throw new Error(
          `Failed to create Zoom meeting: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }
}

export const zoomService = new ZoomService();
