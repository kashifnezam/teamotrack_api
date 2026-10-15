import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  async create(dto: CreateContactDto) {
    // Honeypot: discard submissions from bots.
    if (dto.website?.trim()) {
      return {
        success: true,
        message: 'Your message has been received.',
      };
    }

    const enquiry = {
      name: dto.name.trim(),
      email: dto.email.trim().toLowerCase(),
      phone: dto.phone?.trim() || null,
      subject: dto.subject.trim(),
      message: dto.message.trim(),
      status: 'new',
      source: 'website',
      createdAt: new Date(),
    };

    try {
      const docRef = await this.firebaseService.firestore.collection('contact_submissions').add(enquiry);

      this.logger.log(`Contact enquiry saved: ${docRef.id}`);

      return {
        success: true,
        message: 'Your message has been received. We will contact you soon.',
        referenceId: docRef.id,
      };
    } catch (error) {
      this.logger.error(
        'Failed to save contact enquiry to Firestore',
        error instanceof Error ? error.stack : undefined
      );

      throw new InternalServerErrorException('We could not submit your message right now. Please try again later.');
    }
  }
}
