import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { FieldPath, Timestamp } from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';

import { NotificationQueryDto } from './dto/notification.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private readonly DEFAULT_LIMIT = 10;

  private readonly MAX_LIMIT = 10;

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ==================================================
  // GET ALL
  // ==================================================

  async getAll(userId: string, dto: NotificationQueryDto) {
    const limit = Math.min(Number(dto.limit) || this.DEFAULT_LIMIT, this.MAX_LIMIT);

    try {
      const collection = this.getNotificationCollection(userId);

      let query = collection
        .orderBy('createdAt', 'desc')
        .orderBy(FieldPath.documentId(), 'desc')
        .limit(limit + 1);

      // ==================================================
      // CURSOR
      // ==================================================

      if (dto.cursor) {
        const cursor = this.decodeCursor(dto.cursor);

        query = query.startAfter(Timestamp.fromMillis(cursor.createdAt), cursor.id);
      }

      // ==================================================
      // FETCH
      // ==================================================

      const snap = await query.get();

      const hasNext = snap.docs.length > limit;

      const docs = hasNext ? snap.docs.slice(0, limit) : snap.docs;

      // ==================================================
      // NEXT CURSOR
      // ==================================================

      let nextCursor: string | null = null;

      if (hasNext && docs.length > 0) {
        const lastDoc = docs[docs.length - 1];

        const createdAt = this.getCreatedAtMillis(lastDoc.data());

        nextCursor = this.encodeCursor({
          createdAt,
          id: lastDoc.id,
        });
      }

      // ==================================================
      // UNREAD COUNT
      // ==================================================

      const unreadSnap = await collection.where('read', '==', false).get();

      // ==================================================
      // RESPONSE
      // ==================================================

      return {
        notifications: docs.map((doc) => ({
          id: doc.id,

          ...this.pick(doc.data()),
        })),

        unreadCount: unreadSnap.size,

        pagination: {
          limit,

          hasNext,

          nextCursor,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch notifications | user=${userId}`,
        error instanceof Error ? error.stack : undefined
      );

      throw error;
    }
  }

  // ==================================================
  // MARK ONE AS READ
  // ==================================================

  async markAsRead(userId: string, notificationId: string) {
    try {
      const ref = this.getNotificationCollection(userId).doc(notificationId);

      const doc = await ref.get();

      if (!doc.exists) {
        throw new NotFoundException('Notification not found');
      }

      if (doc.data()?.read === true) {
        return {
          success: true,

          id: notificationId,

          read: true,
        };
      }

      await ref.update({
        read: true,

        readAt: new Date(),
      });

      this.logger.log(`Notification marked as read | id=${notificationId} | user=${userId}`);

      return {
        success: true,

        id: notificationId,

        read: true,
      };
    } catch (error) {
      this.logger.error(
        `Failed to mark notification as read | id=${notificationId} | user=${userId}`,
        error instanceof Error ? error.stack : undefined
      );

      throw error;
    }
  }

  // ==================================================
  // MARK ALL AS READ
  // ==================================================

  async markAllAsRead(userId: string) {
    try {
      const collection = this.getNotificationCollection(userId);

      const snap = await collection.where('read', '==', false).get();

      if (snap.empty) {
        return {
          success: true,

          updated: 0,
        };
      }

      let updated = 0;

      for (let i = 0; i < snap.docs.length; i += 500) {
        const batch = this.db.batch();

        const chunk = snap.docs.slice(i, i + 500);

        for (const doc of chunk) {
          batch.update(doc.ref, {
            read: true,

            readAt: new Date(),
          });
        }

        await batch.commit();

        updated += chunk.length;
      }

      this.logger.log(`All notifications marked as read | user=${userId} | count=${updated}`);

      return {
        success: true,

        updated,
      };
    } catch (error) {
      this.logger.error(
        `Failed to mark all notifications as read | user=${userId}`,
        error instanceof Error ? error.stack : undefined
      );

      throw error;
    }
  }

  // ==================================================
  // NOTIFICATION COLLECTION
  // ==================================================

  private getNotificationCollection(userId: string) {
    return this.db.collection('user').doc(userId).collection('notifications');
  }

  // ==================================================
  // PICK
  // ==================================================

  private pick(data: any) {
    return {
      title: data.title ?? '',

      /*
       * Flutter uses "body".
       *
       * Keep both fields because existing
       * notifications may contain message.
       */

      body: data.body ?? data.message ?? '',

      message: data.message ?? data.body ?? '',

      type: data.type ?? 'general',

      read: data.read === true,

      createdAt: this.normalizeDate(data.createdAt),

      readAt: this.normalizeDate(data.readAt),

      data: data.data ?? null,

      actionUrl: data.actionUrl ?? null,

      icon: data.icon ?? null,
    };
  }

  // ==================================================
  // DATE
  // ==================================================

  private normalizeDate(value: any) {
    if (!value) {
      return null;
    }

    if (value instanceof Timestamp) {
      return value.toDate().toISOString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value?.toDate === 'function') {
      return value.toDate().toISOString();
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number') {
      return new Date(value).toISOString();
    }

    return null;
  }

  // ==================================================
  // CREATED AT
  // ==================================================

  private getCreatedAtMillis(data: any): number {
    const value = data.createdAt;

    if (!value) {
      throw new BadRequestException('Notification createdAt is missing');
    }

    if (value instanceof Timestamp) {
      return value.toMillis();
    }

    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value?.toMillis === 'function') {
      return value.toMillis();
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const time = new Date(value).getTime();

      if (!Number.isNaN(time)) {
        return time;
      }
    }

    throw new BadRequestException('Notification contains an invalid createdAt value');
  }

  // ==================================================
  // ENCODE CURSOR
  // ==================================================

  private encodeCursor(cursor: { createdAt: number; id: string }) {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  // ==================================================
  // DECODE CURSOR
  // ==================================================

  private decodeCursor(cursor: string): {
    createdAt: number;
    id: string;
  } {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));

      if (typeof decoded.createdAt !== 'number' || typeof decoded.id !== 'string' || !decoded.id) {
        throw new Error('Invalid cursor');
      }

      return decoded;
    } catch {
      throw new BadRequestException('Invalid notification cursor');
    }
  }
}
