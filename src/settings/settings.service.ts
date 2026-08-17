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
        new Logger(SettingsService.name);

    constructor(
        private readonly firebase: FirebaseService,
    ) {}


    private get db() {
        return this.firebase.firestore;
    }


    // ==================================================
    // GET DATA
    // ==================================================

    async getData(rootId: string) {

        this.logger.log(
            `Fetching settings | rootId=${rootId}`,
        );

        try {

            const [
                userSnap,
                companySnap,
                permissionSnap,
            ] = await Promise.all([

                this.db
                    .collection('user')
                    .doc(rootId)
                    .get(),

                this.db
                    .collection('businesses')
                    .doc(rootId)
                    .get(),

                this.db
                    .collection('businesses')
                    .doc(rootId)
                    .collection('settings')
                    .doc('permissions')
                    .get(),

            ]);


            if (!userSnap.exists) {

                this.logger.warn(
                    `Settings user not found | rootId=${rootId}`,
                );

                throw new NotFoundException(
                    'User not found',
                );
            }


            const user =
                userSnap.data() || {};

            const company =
                companySnap.exists
                    ? companySnap.data() || {}
                    : {};

            const permissions =
                permissionSnap.exists
                    ? permissionSnap.data() || {}
                    : this.defaultPermissions();


            this.logger.log(
                `Settings fetched | rootId=${rootId}`,
            );


            return {

                profile: {
                    fullName:
                        user.fullName ||
                        user.name ||
                        user.email ||
                        'Unknown',

                    email:
                        user.email ?? '',

                    mobile:
                        user.mobile ?? '',

                    role:
                        user.role ?? '',
                },

                company: {
                    businessName:
                        company.businessName ??
                        'My Company',

                    logo:
                        company.logo ?? '',
                },

                permissions,
            };

        } catch (error) {

            this.logger.error(
                `Failed to fetch settings | rootId=${rootId}`,
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
        rootId: string,
        dto: SettingsDto,
    ) {

        this.logger.log(
            `Updating profile | rootId=${rootId}`,
        );


        if (!dto.fullName?.trim()) {

            this.logger.warn(
                `Profile update rejected | name missing | rootId=${rootId}`,
            );

            throw new BadRequestException(
                'Name is required',
            );
        }


        const ref =
            this.db
                .collection('user')
                .doc(rootId);

        const snap =
            await ref.get();


        if (!snap.exists) {

            this.logger.warn(
                `Profile update failed | user not found | rootId=${rootId}`,
            );

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


        this.logger.log(
            `Profile updated | rootId=${rootId}`,
        );


        return {
            success: true,
        };
    }


    // ==================================================
    // UPDATE COMPANY
    // ==================================================

    async updateCompany(
        rootId: string,
        dto: SettingsDto,
    ) {

        this.logger.log(
            `Updating company | rootId=${rootId}`,
        );


        if (!dto.businessName?.trim()) {

            this.logger.warn(
                `Company update rejected | name missing | rootId=${rootId}`,
            );

            throw new BadRequestException(
                'Company name is required',
            );
        }


        const ref =
            this.db
                .collection('businesses')
                .doc(rootId);

        const snap =
            await ref.get();


        if (!snap.exists) {

            await ref.set({

                ownerId:
                    rootId,

                businessName:
                    dto.businessName.trim(),

                logo:
                    dto.logo ?? '',

                createdAt:
                    new Date(),

            });

            this.logger.log(
                `Company created | rootId=${rootId}`,
            );

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

            this.logger.log(
                `Company updated | rootId=${rootId}`,
            );
        }


        return {
            success: true,
        };
    }


    // ==================================================
    // UPDATE PERMISSIONS
    // ==================================================

    async updatePermissions(
        rootId: string,
        dto: SettingsDto,
    ) {

        this.logger.log(
            `Updating root permissions | rootId=${rootId}`,
        );


        const permissions = {

            canCreateTask:
                dto.canCreateTask ?? false,

            canEditTask:
                dto.canEditTask ?? false,

            canDeleteTask:
                dto.canDeleteTask ?? false,

            canApproveLeave:
                dto.canApproveLeave ?? false,

            canMarkAttendance:
                dto.canMarkAttendance ?? false,

        };


        await this.db
            .collection('businesses')
            .doc(rootId)
            .collection('settings')
            .doc('permissions')
            .set(
                permissions,
                { merge: true },
            );


        this.logger.log(
            `Root permissions updated | rootId=${rootId}`,
        );


        return {
            success: true,
        };
    }


    // ==================================================
    // DEFAULT PERMISSIONS
    // ==================================================

    private defaultPermissions() {

        return {

            canCreateTask:
                true,

            canEditTask:
                true,

            canDeleteTask:
                false,

            canApproveLeave:
                true,

            canMarkAttendance:
                false,

        };
    }

}