import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../../firebase/firebase.service';
import { StaffDto } from './../dto/staff.dto';

type Role = 'manager' | 'hr' | 'field_executive';

@Injectable()
export class StaffService {

    constructor(
        private readonly firebase: FirebaseService,
    ) { }

    private get db() {
        return this.firebase.firestore;
    }


    // ==================================================
    // GET CHILDREN
    // ==================================================
    async getAll(
        parentId: string,
        role: Role,
    ) {

        const parent = await this.getUser(parentId);

        const rootId =
            this.getRootId(parent);

        const snap = await this.db
            .collection('user')
            .where('rootId', '==', rootId)
            .where('parentId', '==', parentId)
            .where('role', '==', role)
            .get();

        return {
            users: snap.docs.map(doc => ({
                id: doc.id,
                ...this.pick(doc.data()),
            })),
        };
    }


    // ==================================================
    // CREATE
    // ==================================================

    async create(
        parentId: string,
        role: Role,
        dto: StaffDto,
    ) {

        const parent = await this.getUser(parentId);

        await this.authorize(
            parentId,
            role,
            'create',
        );

        if (!dto.email || !dto.password) {
            throw new BadRequestException(
                'Email and password are required',
            );
        }

        const rootId = this.getRootId(parent);

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
                    uid: authUser.uid,
                    rootId,
                    parentId,
                    role,

                    fullName: dto.fullName,
                    email: dto.email,
                    mobile: dto.mobile ?? '',

                    isActive:
                        dto.isActive !== false,

                    createdAt: new Date(),
                    updatedAt: new Date(),
                });

            await this.createPermissions(
                authUser.uid,
                role,
                parentId,
            );

            return {
                success: true,
                id: authUser.uid,
            };

        } catch (error) {

            await this.firebase.auth
                .deleteUser(authUser.uid);

            throw error;
        }
    }


    // ==================================================
    // UPDATE
    // ==================================================

    async update(
        parentId: string,
        id: string,
        dto: StaffDto,
    ) {

        const parent = await this.getUser(parentId);
        const target = await this.getUser(id);

        const rootId =
            this.getRootId(parent);

        if (
            target.parentId !== parentId ||
            target.rootId !== rootId
        ) {
            throw new NotFoundException(
                'User not found',
            );
        }

        await this.authorize(
            parentId,
            target.role,
            'edit',
        );

        await this.db
            .collection('user')
            .doc(id)
            .update({
                fullName: dto.fullName,
                mobile: dto.mobile ?? '',
                isActive:
                    dto.isActive !== false,
                updatedAt: new Date(),
            });

        if (dto.password) {
            await this.firebase.auth.updateUser(
                id,
                {
                    password: dto.password,
                },
            );
        }

        return {
            success: true,
            id,
        };
    }


    // ==================================================
    // DELETE
    // ==================================================

    async remove(
        parentId: string,
        id: string,
    ) {

        const parent = await this.getUser(parentId);
        const target = await this.getUser(id);

        const rootId =
            this.getRootId(parent);

        if (
            target.parentId !== parentId ||
            target.rootId !== rootId
        ) {
            throw new NotFoundException(
                'User not found',
            );
        }

        await this.authorize(
            parentId,
            target.role,
            'delete',
        );

        await Promise.all([
            this.db
                .collection('user')
                .doc(id)
                .delete(),

            this.firebase.auth.deleteUser(id),
        ]);

        return {
            success: true,
            id,
        };
    }


    // ==================================================
    // GET PERMISSIONS
    // ==================================================

    async getPermissions(
        parentId: string,
        id: string,
    ) {

        const parent = await this.getUser(parentId);
        const target = await this.getUser(id);

        const rootId =
            this.getRootId(parent);

        if (
            target.parentId !== parentId ||
            target.rootId !== rootId
        ) {
            throw new NotFoundException(
                'User not found',
            );
        }
        await this.authorize(
            parentId,
            target.role,
            'manage_permissions',
        );

        return {
            id,
            role: target.role,
            permissions:
                await this.permissions(id),
        };
    }


    // ==================================================
    // UPDATE PERMISSIONS
    // ==================================================

    async updatePermissions(
        parentId: string,
        id: string,
        permissions: Record<string, boolean>,
    ) {

        const parent = await this.getUser(parentId);
        const target = await this.getUser(id);
        const rootId =
            this.getRootId(parent);

        if (
            target.parentId !== parentId ||
            target.rootId !== rootId
        ) {
            throw new NotFoundException(
                'User not found',
            );
        }
        await this.authorize(
            parentId,
            target.role,
            'manage_permissions',
        );

        /*
         * Child can never receive a permission
         * that its parent does not have.
         */
        const parentPermissions =
            await this.permissions(parentId);

        for (
            const [key, value]
            of Object.entries(permissions)
        ) {

            if (
                value === true &&
                parentPermissions[key] === false
            ) {
                throw new BadRequestException(
                    `Parent does not allow ${key}`,
                );
            }
        }

        await this.db
            .collection('user')
            .doc(id)
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


    // ==================================================
    // AUTHORIZATION
    // ==================================================

    private async authorize(
        userId: string,
        targetRole: Role,
        action: string,
    ) {

        const user = await this.getUser(userId);

        /*
         * Root has complete authority.
         */
        if (
            user.role === 'root_manager' ||
            user.role === 'root_hr' ||
            user.role === 'root' ||
            user.role === 'admin'
        ) {
            return;
        }

        /*
         * HR can only manage HR.
         */
        if (
            user.role === 'hr' &&
            targetRole !== 'hr'
        ) {
            throw new BadRequestException(
                'HR can only manage HR',
            );
        }

        /*
         * Executive cannot manage anyone.
         */
        if (user.role === 'field_executive') {
            throw new BadRequestException(
                'Executive has no management permission',
            );
        }

        const permissions =
            await this.permissions(userId);

        const key =
            `${targetRole}.${action}`;

        if (permissions[key] !== true) {
            throw new BadRequestException(
                'Permission denied',
            );
        }

        /*
         * Walk to root and make sure the
         * authority chain is valid.
         */
        await this.verifyAuthorityChain(
            userId,
            targetRole,
            action,
        );
    }


    // ==================================================
    // AUTHORITY CHAIN
    // ==================================================

    private async verifyAuthorityChain(
        userId: string,
        targetRole: Role,
        action: string,
    ) {

        let current =
            await this.getUser(userId);

        const visited = new Set<string>();

        while (
            current.parentId &&
            !visited.has(current.uid)
        ) {

            visited.add(current.uid);

            const parent =
                await this.getUser(
                    current.parentId,
                );

            /*
             * Same company.
             */
            if (
                parent.rootId !== current.rootId
            ) {
                throw new BadRequestException(
                    'Invalid hierarchy',
                );
            }

            /*
             * Parent must also allow
             * this operation.
             *
             * Root bypasses this check.
             */
            if (
                parent.role !== 'root_manager' &&
                parent.role !== 'root' &&
                parent.role !== 'admin'
            ) {

                const parentPermissions =
                    await this.permissions(
                        parent.uid,
                    );

                const key =
                    `${targetRole}.${action}`;

                if (
                    parentPermissions[key] !== true
                ) {
                    throw new BadRequestException(
                        'Parent authority denied',
                    );
                }
            }

            current = parent;
        }
    }


    // ==================================================
    // CREATE DEFAULT PERMISSIONS
    // ==================================================

    private async createPermissions(
        uid: string,
        role: Role,
        parentId: string,
    ) {

        const parentPermissions =
            await this.permissions(parentId);

        let permissions: Record<string, boolean>;

        if (role === 'manager') {

            permissions = {
                'manager.create': true,
                'manager.edit': true,
                'manager.delete': false,
                'manager.manage_permissions': true,

                'hr.create': true,
                'hr.edit': true,
                'hr.delete': false,
                'hr.manage_permissions': true,

                'field_executive.create': true,
                'field_executive.edit': true,
                'field_executive.delete': true,

                'attendance.view': true,
                'attendance.manage': true,

                'tracking.view': true,
            };

        } else if (role === 'hr') {

            permissions = {
                'manager.create': false,
                'manager.edit': false,
                'manager.delete': false,
                'manager.manage_permissions': false,

                'hr.create': true,
                'hr.edit': true,
                'hr.delete': false,
                'hr.manage_permissions': false,

                'field_executive.create': false,
                'field_executive.edit': false,
                'field_executive.delete': false,

                'attendance.view': true,
                'attendance.manage': true,

                'tracking.view': true,
            };

        } else {

            permissions = {};
        }

        /*
         * Never give child more authority
         * than parent.
         */
        for (
            const key of Object.keys(permissions)
        ) {

            if (
                parentPermissions[key] === false
            ) {
                permissions[key] = false;
            }
        }

        await this.db
            .collection('user')
            .doc(uid)
            .collection('settings')
            .doc('permissions')
            .set(permissions);
    }


    // ==================================================
    // USER
    // ==================================================

    private async getUser(uid: string) {

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

        return {
            uid: doc.id,
            ...doc.data(),
        } as any;
    }

    private getRootId(user: any): string {

        if (
            user.role === 'root_manager' ||
            user.role === 'root_hr' ||
            user.role === 'root' ||
            user.role === 'admin'
        ) {
            return user.uid;
        }

        if (!user.rootId) {
            throw new BadRequestException(
                'Invalid hierarchy',
            );
        }

        return user.rootId;
    }


    // ==================================================
    // PERMISSIONS
    // ==================================================

    private async permissions(uid: string) {

        const doc =
            await this.db
                .collection('user')
                .doc(uid)
                .collection('settings')
                .doc('permissions')
                .get();

        return doc.exists
            ? doc.data() ?? {}
            : {};
    }


    // ==================================================
    // PICK
    // ==================================================

    private pick(data: any) {

        return {
            fullName: data.fullName ?? '',
            email: data.email ?? '',
            mobile: data.mobile ?? '',
            isActive: data.isActive !== false,
            role: data.role ?? '',
            parentId: data.parentId ?? '',
        };
    }
}