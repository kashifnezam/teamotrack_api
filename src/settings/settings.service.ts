import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { SettingsDto } from './dto/settings.dto';


@Injectable()
export class SettingsService {

    constructor(
        private readonly firebase: FirebaseService,
    ) {}


    private get db() {
        return this.firebase.firestore;
    }


    async getData(rootId: string) {

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


        return {

            profile: {
                fullName:
                    user.fullName || user.name || user.email || "Unknown",
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

    }


    async updateProfile(
        rootId: string,
        dto: SettingsDto,
    ) {

        if (!dto.fullName?.trim()) {

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
            success: true,
        };

    }


    async updateCompany(
        rootId: string,
        dto: SettingsDto,
    ) {

        if (!dto.businessName?.trim()) {

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

                ownerId: rootId,

                businessName:
                    dto.businessName.trim(),

                logo:
                    dto.logo ?? '',

                createdAt:
                    new Date(),

            });

        } else {

            const data: any = {

                businessName:
                    dto.businessName.trim(),

                updatedAt:
                    new Date(),

            };


            if (dto.logo !== undefined) {
                data.logo = dto.logo;
            }


            await ref.update(data);

        }


        return {
            success: true,
        };

    }


    async updatePermissions(
        rootId: string,
        dto: SettingsDto,
    ) {

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


        return {
            success: true,
        };

    }


    private defaultPermissions() {

        return {

            canCreateTask: true,

            canEditTask: true,

            canDeleteTask: false,

            canApproveLeave: true,

            canMarkAttendance: false,

        };

    }

}