import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { SettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {

    private readonly logger =
        new Logger(
            SettingsService.name,
        );


    constructor(
        private readonly firebase:
            FirebaseService,
    ) { }


    private get db() {
        return this.firebase.firestore;
    }


    // ==================================================
    // GET USER
    // ==================================================

    private async getUser(
        userId: string,
    ) {

        const doc =
            await this.db
                .collection('user')
                .doc(userId)
                .get();


        if (!doc.exists) {

            throw new NotFoundException(
                'User not found',
            );

        }


        return {

            uid:
                doc.id,

            ...doc.data(),

        } as any;

    }


    // ==================================================
    // ROOT
    // ==================================================

    private getRootId(
        user: any,
    ): string {

        if (
            [
                'root',
                'admin',
                'root_manager',
                'root_hr',
            ].includes(
                user.role,
            )
        ) {

            return (
                user.rootId ||
                user.uid
            );

        }


        if (!user.rootId) {

            throw new BadRequestException(
                'Invalid organization',
            );

        }


        return user.rootId;

    }


    // ==================================================
    // GET DATA
    // ==================================================

    async getData(
        userId: string,
    ) {

        this.logger.log(
            `Fetching settings | userId=${userId}`,
        );


        try {

            const user =
                await this.getUser(
                    userId,
                );


            const rootId =
                this.getRootId(
                    user,
                );


            const organizationSnap =
                await this.db
                    .collection('organization')
                    .doc(rootId)
                    .get();


            const organization =
                organizationSnap.exists
                    ? organizationSnap.data() || {}
                    : {};


            return {

                profile: {

                    fullName:
                        user.fullName ||
                        user.name ||
                        user.email ||
                        'Unknown',

                    email:
                        user.email ??
                        '',

                    mobile:
                        user.mobile ??
                        '',

                    role:
                        user.role ??
                        '',

                },


                company: {

                    businessName:
                        organization.businessName ??
                        'My Company',

                    logo:
                        organization.logo ??
                        '',

                },

            };

        } catch (error) {

            this.logger.error(
                `Failed to fetch settings | userId=${userId}`,

                error instanceof Error
                    ? error.stack
                    : undefined,
            );


            throw error;
        }

    }


    // ==================================================
    // UPDATE PROFILE
    // ==================================================

    async updateProfile(
        userId: string,
        dto: SettingsDto,
    ) {

        if (
            !dto.fullName?.trim()
        ) {

            throw new BadRequestException(
                'Name is required',
            );

        }


        const ref =
            this.db
                .collection('user')
                .doc(userId);


        const snap =
            await ref.get();


        if (!snap.exists) {

            throw new NotFoundException(
                'User not found',
            );

        }


        await ref.update({

            fullName:
                dto.fullName.trim(),

            updatedAt:
                new Date(),

        });


        return {

            success:
                true,

        };

    }


    // ==================================================
    // UPLOAD ORGANIZATION LOGO
    // ==================================================

    async uploadLogo(
        userId: string,
        file: any,
    ) {

        if (!file) {

            throw new BadRequestException(
                'Logo is required',
            );

        }


        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
        ];


        if (
            !allowedTypes.includes(
                file.mimetype,
            )
        ) {

            throw new BadRequestException(
                'Invalid logo format',
            );

        }


        const user =
            await this.getUser(
                userId,
            );


        const rootId =
            this.getRootId(
                user,
            );


        const organizationRef =
            this.db
                .collection('organization')
                .doc(rootId);


        const organizationSnap =
            await organizationRef.get();


        if (!organizationSnap.exists) {

            throw new NotFoundException(
                'Organization not found',
            );

        }


        const bucket =
            this.firebase.storage.bucket();


        const extension =
            file.originalname
                ?.split('.')
                .pop()
                ?.toLowerCase() ||
            'png';


        const filePath =
            `family_room/image/companyLogo/${rootId}_${Date.now()}.${extension}`;


        const storageFile =
            bucket.file(
                filePath,
            );


        await storageFile.save(
            file.buffer,
            {
                metadata: {

                    contentType:
                        file.mimetype,

                },
            },
        );


        await storageFile.makePublic();


        const logo =
            `https://storage.googleapis.com/${bucket.name}/${filePath}`;


        await organizationRef.update({

            logo,

            updatedAt:
                new Date(),

        });


        this.logger.log(
            `Organization logo updated | rootId=${rootId} | path=${filePath}`,
        );


        return {

            success:
                true,

            logo,

        };

    }


    // ==================================================
    // UPDATE ORGANIZATION
    // ==================================================

    async updateCompany(
        userId: string,
        dto: SettingsDto,
    ) {

        if (
            !dto.businessName?.trim()
        ) {

            throw new BadRequestException(
                'Company name is required',
            );

        }


        const user =
            await this.getUser(
                userId,
            );


        const rootId =
            this.getRootId(
                user,
            );


        const ref =
            this.db
                .collection('organization')
                .doc(rootId);


        const snap =
            await ref.get();


        if (!snap.exists) {

            await ref.set({

                rootId,

                businessName:
                    dto.businessName.trim(),

                logo:
                    dto.logo ?? '',

                createdAt:
                    new Date(),

                updatedAt:
                    new Date(),

            });

        } else {

            const data: any = {

                businessName:
                    dto.businessName.trim(),

                updatedAt:
                    new Date(),

            };


            if (
                dto.logo !== undefined
            ) {

                data.logo =
                    dto.logo;

            }


            await ref.update(
                data,
            );

        }


        return {

            success:
                true,

        };

    }

}