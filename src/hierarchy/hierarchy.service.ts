import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { HierarchyDto } from './dto/hierarchy.dto';

@Injectable()
export class HierarchyService {

    constructor(
        private readonly firebase: FirebaseService,
    ) {}

    private get db() {
        return this.firebase.firestore;
    }


    // ======================================================
    // DATA
    // ======================================================

    async getData(uid: string) {

        const current =
            await this.db
                .collection('user')
                .doc(uid)
                .get();

        if (!current.exists) {
            throw new NotFoundException(
                'User not found',
            );
        }

        const user =
            current.data()!;

        const snap =
            await this.db
                .collection('user')
                .where(
                    'rootId',
                    '==',
                    user.rootId || uid,
                )
                .select(
                    'fullName',
                    'email',
                    'mobile',
                    'role',
                    'parentId',
                    'rootId',
                    'isActive',
                    'permissions',
                )
                .get();

        return {

            current: {
                id: uid,
                role: user.role,
                permissions:
                    user.permissions || {},
            },

            users:
                snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                })),

        };

    }


    // ======================================================
    // CREATE CHILD
    // ======================================================

    async create(
        parentId: string,
        dto: HierarchyDto,
    ) {

        const parent =
            await this.getUser(parentId);

        this.validateRole(
            parent.role,
            dto.role,
        );

        const permissions =
            this.validatePermissions(
                parent,
                dto.permissions,
            );

        const rootId =
            parent.rootId || parentId;


        if (!dto.password) {

            throw new BadRequestException(
                'Password is required',
            );

        }


        const authUser =
            await this.firebase.auth.createUser({
                email: dto.email,
                password: dto.password,
            });


        try {

            await this.db
                .collection('user')
                .doc(authUser.uid)
                .set({

                    uid:
                        authUser.uid,

                    fullName:
                        dto.fullName,

                    email:
                        dto.email,

                    mobile:
                        dto.mobile || '',

                    role:
                        dto.role,

                    parentId,

                    rootId,

                    permissions,

                    isActive:
                        true,

                    createdAt:
                        new Date(),

                });


            return {
                success: true,
                id: authUser.uid,
            };

        } catch (error) {

            await this.firebase.auth
                .deleteUser(
                    authUser.uid,
                );

            throw error;
        }

    }


    // ======================================================
    // UPDATE
    // ======================================================

    async update(
        parentId: string,
        id: string,
        dto: HierarchyDto,
    ) {

        const parent =
            await this.getUser(parentId);

        const ref =
            this.db
                .collection('user')
                .doc(id);

        const doc =
            await ref.get();

        if (!doc.exists) {
            throw new NotFoundException(
                'User not found',
            );
        }

        const child =
            doc.data()!;


        if (
            child.rootId !==
            (parent.rootId || parentId)
        ) {

            throw new NotFoundException(
                'User not found',
            );

        }


        // Parent can update only
        // users below it.
        if (
            child.parentId !== parentId &&
            parent.role !== 'root_manager'
        ) {

            throw new BadRequestException(
                'You cannot manage this user',
            );

        }


        const permissions =
            this.validatePermissions(
                parent,
                dto.permissions,
            );


        await ref.update({

            fullName:
                dto.fullName,

            mobile:
                dto.mobile || '',

            permissions,

            updatedAt:
                new Date(),

        });


        if (dto.password) {

            await this.firebase.auth
                .updateUser(
                    id,
                    {
                        password:
                            dto.password,
                    },
                );

        }


        return {
            success: true,
            id,
        };

    }


    // ======================================================
    // USER
    // ======================================================

    private async getUser(
        uid: string,
    ) {

        const doc =
            await this.db
                .collection('user')
                .doc(uid)
                .get();

        if (!doc.exists) {

            throw new NotFoundException(
                'User not found',
            );

        }

        return doc.data()!;

    }


    // ======================================================
    // ROLE
    // ======================================================

    private validateRole(
        parentRole: string,
        childRole: string,
    ) {

        const valid =
            (
                parentRole === 'root_manager' &&
                childRole === 'manager'
            ) ||
            (
                parentRole === 'manager' &&
                childRole === 'manager'
            ) ||
            (
                parentRole === 'root_hr' &&
                childRole === 'hr'
            ) ||
            (
                parentRole === 'hr' &&
                childRole === 'hr'
            );

        if (!valid) {

            throw new BadRequestException(
                'Invalid child role',
            );

        }

    }


    // ======================================================
    // PERMISSIONS
    // ======================================================

    private validatePermissions(
        parent: any,
        requested?: Record<string, boolean>,
    ) {

        const parentPermissions =
            parent.permissions || {};

        const result:
            Record<string, boolean> = {};


        Object.entries(
            requested || {},
        ).forEach(
            ([key, value]) => {

                if (
                    value === true &&
                    parent.role !== 'root_manager' &&
                    parent.role !== 'root_hr' &&
                    parentPermissions[key] !== true
                ) {

                    throw new BadRequestException(
                        `Permission "${key}" is not available`,
                    );

                }

                result[key] =
                    value === true;

            },
        );


        return result;

    }

}