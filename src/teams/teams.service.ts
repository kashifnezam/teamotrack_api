import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';
import { TeamDto } from './dto/team.dto';

@Injectable()
export class TeamsService {

    private readonly logger =
        new Logger(TeamsService.name);

    constructor(
        private readonly firebase: FirebaseService,
    ) { }

    private get db() {
        return this.firebase.firestore;
    }

    // ==================================================
    // GET ALL
    // ==================================================

    async getAll(
        userId: string,
    ) {

        const user =
            await this.getUser(userId);

        const rootId =
            this.getRootId(user);

        const [
            teamSnap,
            userSnap,
            shiftSnap,
        ] = await Promise.all([

            this.db
                .collection('teams')
                .where('rootId', '==', rootId)
                .get(),

            this.db
                .collection('user')
                .where('rootId', '==', rootId)
                .get(),

            this.db
                .collection('shifts')
                .where('rootId', '==', rootId)
                .get(),

        ]);

        const users =
            userSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as any[];

        /*
         * Managers/HR visible from
         * requester's hierarchy.
         */
        const visibleUsers =
            this.getVisibleUsers(
                user,
                users,
            );

        /*
         * Visible manager IDs.
         */
        const visibleManagerIds =
            new Set(
                visibleUsers
                    .filter(item =>
                        [
                            'manager',
                            'child_manager',
                        ].includes(item.role),
                    )
                    .map(item => item.id),
            );

        /*
         * Root:
         *   all teams in root.
         *
         * Manager:
         *   own teams +
         *   descendant manager teams.
         *
         * HR / Executive:
         *   no team management.
         */
        let teams =
            teamSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as any[];

        if (!this.isRoot(user)) {

            if (
                user.role === 'hr' ||
                user.role === 'field_executive'
            ) {

                teams = [];

            } else {

                teams =
                    teams.filter(team => {

                        if (!team.leadId) {
                            return false;
                        }

                        return visibleManagerIds.has(
                            team.leadId,
                        );

                    });

            }

        }

        /*
         * Executive counts.
         */
        const counts: Record<string, number> = {};

        users.forEach(item => {

            if (
                item.role !==
                'field_executive'
            ) {
                return;
            }

            /*
             * Root sees all executives.
             *
             * Manager sees executives
             * belonging to its hierarchy.
             */
            if (
                !this.isRoot(user) &&
                !this.isVisibleUser(
                    item.id,
                    visibleUsers,
                )
            ) {
                return;
            }

            if (item.teamId) {

                counts[item.teamId] =
                    (counts[item.teamId] || 0) + 1;

            }

        });

        /*
         * Managers available as
         * team leads.
         */
        const managers =
            visibleUsers
                .filter(item =>
                    [
                        'manager',
                        'child_manager',
                    ].includes(item.role),
                )
                .map(manager => ({

                    id:
                        manager.id,

                    fullName:
                        manager.fullName ?? '',

                }));

        return {

            isRoot:
                this.isRoot(user),
                
            teams:
                teams.map(team => ({

                    id:
                        team.id,

                    name:
                        team.name ?? '',

                    leadId:
                        team.leadId ?? '',

                    shiftId:
                        team.shiftId ?? '',

                    totalExecutives:
                        counts[team.id] || 0,

                })),

            managers,

            shifts:
                shiftSnap.docs.map(doc => ({

                    id:
                        doc.id,

                    name:
                        doc.data().name ?? '',

                })),

        };

    }


    // ==================================================
    // CREATE
    // ==================================================

    async create(
        userId: string,
        dto: TeamDto,
    ) {

        const user =
            await this.getUser(userId);

        await this.authorize(
            user,
            'team.create',
        );

        const rootId =
            this.getRootId(user);

        this.validate(dto);


        /*
         * NON-ROOT MANAGERS MUST ALWAYS
         * HAVE A TEAM LEAD.
         *
         * Only root can create an
         * unassigned/root-owned team.
         */
        if (
            !this.isRoot(user) &&
            !dto.leadId
        ) {

            throw new BadRequestException(
                'Team manager is required',
            );

        }


        /*
         * Shift must belong to the
         * same organization.
         */
        await this.verifyShift(
            rootId,
            dto.shiftId,
        );


        /*
         * Validate selected manager.
         *
         * For root:
         *   any manager in same root.
         *
         * For manager:
         *   self or descendant only.
         */
        if (dto.leadId) {

            await this.verifyManager(
                user,
                dto.leadId,
            );

        }


        const now =
            new Date();


        const ref =
            await this.db
                .collection('teams')
                .add({

                    name:
                        dto.name.trim(),

                    rootId,

                    leadId:
                        dto.leadId || null,

                    shiftId:
                        dto.shiftId || null,

                    totalExecutives:
                        0,

                    activeToday:
                        0,

                    createdBy:
                        userId,

                    createdAt:
                        now,

                    updatedAt:
                        now,

                });


        this.logger.log(
            `Team created | id=${ref.id} | user=${userId} | lead=${dto.leadId || 'ROOT'}`,
        );


        return {
            success: true,
            id: ref.id,
        };

    }

    // ==================================================
    // UPDATE
    // ==================================================

    // ==================================================
    // UPDATE
    // ==================================================

    async update(
        userId: string,
        id: string,
        dto: TeamDto,
    ) {

        const user =
            await this.getUser(userId);

        await this.authorize(
            user,
            'team.edit',
        );

        const rootId =
            this.getRootId(user);

        this.validate(dto);


        const ref =
            this.db
                .collection('teams')
                .doc(id);


        const doc =
            await ref.get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Team not found',
            );

        }


        const team =
            doc.data()!;


        /*
         * Existing team must be inside
         * requester's hierarchy.
         */
        if (!this.isRoot(user)) {

            await this.verifyTeamAccess(
                user,
                team,
            );

        }


        /*
         * NON-ROOT MANAGERS CANNOT
         * REMOVE THE TEAM LEAD.
         */
        if (
            !this.isRoot(user) &&
            !dto.leadId
        ) {

            throw new BadRequestException(
                'Team manager is required',
            );

        }


        /*
         * Check whether lead is being changed.
         */
        const leadChanged =
            (
                dto.leadId || null
            ) !== (
                team.leadId || null
            );


        /*
         * A team with executives cannot
         * change its manager.
         *
         * This protects:
         *
         * Manager
         *    ↓
         * Team
         *    ↓
         * Executives
         *
         * from becoming inconsistent.
         */
        if (leadChanged) {

            const executives =
                await this.db
                    .collection('user')
                    .where(
                        'rootId',
                        '==',
                        rootId,
                    )
                    .where(
                        'role',
                        '==',
                        'field_executive',
                    )
                    .where(
                        'teamId',
                        '==',
                        id,
                    )
                    .limit(1)
                    .get();


            if (!executives.empty) {

                throw new BadRequestException(
                    'Team manager cannot be changed while executives are assigned to this team',
                );

            }

        }


        /*
         * Validate new shift.
         */
        await this.verifyShift(
            rootId,
            dto.shiftId,
        );


        /*
         * Validate new manager.
         */
        if (dto.leadId) {

            await this.verifyManager(
                user,
                dto.leadId,
            );

        }


        await ref.update({

            name:
                dto.name.trim(),

            leadId:
                dto.leadId || null,

            shiftId:
                dto.shiftId || null,

            updatedAt:
                new Date(),

        });


        this.logger.log(
            `Team updated | id=${id} | user=${userId} | lead=${dto.leadId || 'ROOT'}`,
        );


        return {
            success: true,
            id,
        };

    }

    // ==================================================
    // DELETE
    // ==================================================

    async remove(
        userId: string,
        id: string,
    ) {

        const user =
            await this.getUser(userId);

        await this.authorize(
            user,
            'team.delete',
        );

        const rootId =
            this.getRootId(user);

        const ref =
            this.db
                .collection('teams')
                .doc(id);

        const team =
            await ref.get();

        if (
            !team.exists ||
            team.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Team not found',
            );

        }

        const teamData =
            team.data()!;

        /*
         * Root can delete any team
         * in its organization.
         *
         * Non-root manager can delete
         * only teams in its hierarchy.
         */
        if (!this.isRoot(user)) {

            await this.verifyTeamAccess(
                user,
                teamData,
            );

        }

        /*
         * Prevent deleting a team
         * that still has executives.
         */
        const executives =
            await this.db
                .collection('user')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'role',
                    '==',
                    'field_executive',
                )
                .where(
                    'teamId',
                    '==',
                    id,
                )
                .limit(1)
                .get();

        if (!executives.empty) {

            throw new BadRequestException(
                'Executives are attached to this team',
            );

        }

        await ref.delete();

        this.logger.log(
            `Team deleted | id=${id} | user=${userId}`,
        );

        return {
            success: true,
            id,
        };

    }

    // ==================================================
    // TEAM ACCESS
    // ==================================================

    private async verifyTeamAccess(
        user: any,
        team: any,
    ) {

        /*
         * Team must belong to the
         * requester's organization.
         */
        if (
            team.rootId !==
            this.getRootId(user)
        ) {

            throw new NotFoundException(
                'Team not found',
            );

        }


        /*
         * A team without a manager is
         * root-only.
         *
         * Non-root users cannot manage it.
         */
        if (!team.leadId) {

            throw new NotFoundException(
                'Team not found',
            );

        }


        /*
         * Requester must be:
         *
         * - team lead
         * - ancestor of team lead
         */
        await this.verifyManager(
            user,
            team.leadId,
        );

    }

    // ==================================================
    // VERIFY MANAGER
    // ==================================================

    // ==================================================
    // VERIFY MANAGER
    // ==================================================

    private async verifyManager(
        user: any,
        managerId: string,
    ) {

        if (!managerId) {

            throw new BadRequestException(
                'Team manager is required',
            );

        }


        const manager =
            await this.getUser(
                managerId,
            );


        /*
         * Only manager roles can
         * lead a team.
         *
         * Root roles themselves are
         * NOT valid team leads.
         */
        if (
            ![
                'manager',
                'child_manager',
            ].includes(
                manager.role,
            )
        ) {

            throw new BadRequestException(
                'Invalid team manager',
            );

        }


        /*
         * Same organization.
         */
        if (
            this.getRootId(user) !==
            this.getRootId(manager)
        ) {

            throw new BadRequestException(
                'Invalid team manager',
            );

        }


        /*
         * Root can select any normal
         * manager inside the organization.
         */
        if (this.isRoot(user)) {

            return;

        }


        /*
         * Non-root manager can select:
         *
         * - itself
         * - descendants
         *
         * NEVER root.
         */
        if (
            manager.uid ===
            user.uid
        ) {

            return;

        }


        await this.verifyDescendant(
            user.uid,
            manager.uid,
        );

    }

    // ==================================================
    // VISIBLE USERS
    // ==================================================

    private getVisibleUsers(
        user: any,
        users: any[],
    ) {

        /*
         * Root sees everybody
         * inside the organization.
         */
        if (this.isRoot(user)) {
            return users;
        }


        /*
         * HR and executives do not
         * manage teams.
         */
        if (
            user.role === 'hr' ||
            user.role === 'field_executive'
        ) {

            return [];

        }


        /*
         * Normalize requester so it has
         * the same `id` field as users
         * loaded from Firestore.
         */
        const requester = {
            ...user,
            id: user.uid,
        };


        /*
         * parentId -> children
         */
        const children =
            new Map<string, any[]>();


        for (const item of users) {

            if (!item.parentId) {
                continue;
            }


            if (
                !children.has(
                    item.parentId,
                )
            ) {

                children.set(
                    item.parentId,
                    [],
                );

            }


            children
                .get(item.parentId)!
                .push(item);

        }


        const result: any[] = [];


        /*
         * Include requester itself.
         *
         * This is important because a manager
         * can have a team directly assigned
         * to themselves.
         */
        result.push(requester);


        /*
         * Recursively collect descendants.
         */
        const walk =
            (parentId: string) => {

                for (
                    const child
                    of children.get(parentId) || []
                ) {

                    result.push(child);

                    /*
                     * Firestore document ID is
                     * the normalized hierarchy ID.
                     */
                    walk(child.id);

                }

            };


        walk(requester.id);


        return result;

    }

    // ==================================================
    // VISIBLE USER
    // ==================================================

    private isVisibleUser(
        id: string,
        users: any[],
    ) {

        return users.some(
            item =>
                item.id === id ||
                item.uid === id,
        );

    }

    // ==================================================
    // DESCENDANT
    // ==================================================

    private async verifyDescendant(
        parentId: string,
        targetId: string,
    ) {

        if (
            parentId === targetId
        ) {

            return;

        }

        const target =
            await this.getUser(
                targetId,
            );

        let current =
            target;

        const visited =
            new Set<string>();

        while (
            current.parentId &&
            !visited.has(current.uid)
        ) {

            visited.add(
                current.uid,
            );

            /*
             * Direct child.
             */
            if (
                current.parentId ===
                parentId
            ) {

                return;

            }

            current =
                await this.getUser(
                    current.parentId,
                );

        }

        throw new NotFoundException(
            'Manager not found',
        );

    }

    // ==================================================
    // AUTHORIZATION
    // ==================================================

    private async authorize(
        user: any,
        permission: string,
    ) {

        /*
         * Root roles have full authority.
         */
        if (this.isRoot(user)) {
            return;
        }

        /*
         * HR cannot manage teams.
         */
        if (
            user.role === 'hr'
        ) {

            throw new BadRequestException(
                'HR cannot manage teams',
            );

        }

        /*
         * Executives cannot manage teams.
         */
        if (
            user.role ===
            'field_executive'
        ) {

            throw new BadRequestException(
                'Executive has no management permission',
            );

        }

        /*
         * Check own permission.
         */
        const permissions = await this.getPermissions(user.uid);

        if (
            permissions[permission] !== true
        ) {

            this.logger.log(
                `Permission denied | user=${user.id}`,
            );

            throw new BadRequestException(
                'Permission denied',
            );

        }

        /*
         * Every parent in the hierarchy
         * must also authorize this action.
         */
        await this.verifyAuthorityChain(
            user,
            permission,
        );

    }

    // ==================================================
    // AUTHORITY CHAIN
    // ==================================================

    private async verifyAuthorityChain(
        user: any,
        permission: string,
    ) {

        let current =
            user;

        const visited =
            new Set<string>();

        while (
            current.parentId &&
            !visited.has(current.uid)
        ) {

            visited.add(
                current.uid,
            );

            const parent =
                await this.getUser(
                    current.parentId,
                );

            /*
             * Parent must belong to
             * same organization.
             */
            if (
                this.getRootId(current) !==
                this.getRootId(parent)
            ) {

                throw new BadRequestException(
                    'Invalid hierarchy',
                );

            }

            /*
             * Root terminates the chain.
             */
            if (
                this.isRoot(parent)
            ) {

                return;

            }

            const permissions =
                await this.getPermissions(
                    parent.uid,
                );

            /*
             * Parent must authorize
             * the same capability.
             */
            if (
                permissions[permission] !== true
            ) {

                throw new BadRequestException(
                    'Parent authority denied',
                );

            }

            current =
                parent;

        }

    }

    // ==================================================
    // USER
    // ==================================================

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

        return {
            id: doc.id,
            uid: doc.id,
            ...doc.data(),
        } as any;

    }

    // ==================================================
    // PERMISSIONS
    // ==================================================

    private async getPermissions(
        uid: string,
    ) {

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
    // ROOT
    // ==================================================

    private isRoot(
        user: any,
    ) {

        return [
            'root',
            'admin',
            'root_manager',
            'root_hr',
        ].includes(
            user.role,
        );

    }

    private getRootId(
        user: any,
    ): string {

        if (this.isRoot(user)) {

            return (
                user.rootId ||
                user.uid
            );

        }

        if (!user.rootId) {

            throw new BadRequestException(
                'Invalid hierarchy',
            );

        }

        return user.rootId;

    }

    // ==================================================
    // SHIFTS
    // ==================================================

    private async verifyShift(
        rootId: string,
        shiftId?: string,
    ) {

        if (!shiftId) {
            return;
        }

        const doc =
            await this.db
                .collection('shifts')
                .doc(shiftId)
                .get();

        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new BadRequestException(
                'Invalid shift',
            );

        }

    }

    // ==================================================
    // VALIDATION
    // ==================================================

    private validate(
        dto: TeamDto,
    ) {

        if (!dto.name?.trim()) {

            throw new BadRequestException(
                'Team name is required',
            );

        }

        if (!dto.shiftId) {

            throw new BadRequestException(
                'Shift policy is required',
            );

        }

    }

}