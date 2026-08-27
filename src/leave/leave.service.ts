import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';

import {
    LeaveDto,
    LeaveTypeDto,
} from './dto/leave.dto';


@Injectable()
export class LeaveService {

    private readonly logger =
        new Logger(LeaveService.name);


    constructor(
        private readonly firebase: FirebaseService,
    ) { }


    private get db() {
        return this.firebase.firestore;
    }


    // ==================================================
    // GET MY LEAVES
    // ==================================================

    async getAll(
        userId: string,
    ) {

        const user =
            await this.getUser(userId);

        const rootId =
            this.getRootId(user);


        const snap =
            await this.db
                .collection('leaveRequests')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'userId',
                    '==',
                    userId,
                )
                .orderBy(
                    'createdAt',
                    'desc',
                )
                .get();


        return {

            leaves:
                snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                })),

        };
    }

    // ==================================================
    // TEAM LEAVE
    // ==================================================

    async getTeamLeaves(
        userId: string,
    ) {

        const user =
            await this.getUser(userId);

        const rootId = this.getRootId(user);


        const snap =
            await this.db
                .collection('leaveRequests')
                .where('rootId', '==', rootId)
                .orderBy(
                    'createdAt',
                    'desc',
                )
                .get();


        let leaves: any[] =
            snap.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));


        /*
         * Root sees organization
         * leave history.
         */
        if (
            this.isRoot(user)
        ) {

            return {
                leaves,
            };
        }


        /*
         * HR sees organization history
         * only with permission.
         */
        if (
            user.role === 'hr'
        ) {

            const permissions =
                await this.getPermissions(
                    user.uid,
                );


            if (
                permissions[
                'leave.view.all'
                ] !== true
            ) {

                return {
                    leaves: [],
                };
            }


            return {
                leaves,
            };
        }


        /*
         * Executive has no team.
         */
        if (
            user.role ===
            'field_executive'
        ) {

            return {
                leaves: [],
            };
        }


        /*
         * Manager hierarchy.
         */
        const permissions =
            await this.getPermissions(
                user.uid,
            );


        if (
            permissions[
            'leave.view'
            ] !== true
        ) {

            return {
                leaves: [],
            };
        }


        const descendantIds =
            await this.getDescendantIds(
                user,
            );


        /*
         * Do NOT include own leave.
         * This is Team Leave.
         */
        leaves =
            leaves.filter(
                leave =>
                    descendantIds.has(
                        leave.userId,
                    ),
            );


        return {
            leaves,
        };
    }


    // ==================================================
    // PENDING APPROVALS
    // ==================================================

    async getApprovals(
        userId: string,
    ) {

        const user =
            await this.getUser(userId);

        const rootId =
            this.getRootId(user);


        /*
         * Root / Manager / HR permission.
         */

        if (
            !this.isRoot(user)
        ) {

            const permissions =
                await this.getPermissions(
                    userId,
                );


            if (
                user.role === 'hr'
            ) {

                if (
                    permissions[
                    'leave.approve.all'
                    ] !== true
                ) {

                    return {
                        approvals: [],
                    };
                }

            } else {

                if (
                    permissions[
                    'leave.approve'
                    ] !== true
                ) {

                    return {
                        approvals: [],
                    };
                }
            }
        }


        const snap =
            await this.db
                .collection('leaveRequests')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'status',
                    '==',
                    'pending',
                )
                .get();


        const approvals =
            snap.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }))
                .filter(
                    (leave: any) => {

                        const level =
                            leave.currentLevel;


                        const step =
                            leave.approval?.[
                            level
                            ];


                        return (
                            step?.userId ===
                            userId
                        );
                    },
                );


        return {
            approvals,
        };
    }


    async create(
        userId: string,
        dto: LeaveDto,
    ) {

        const user =
            await this.getUser(userId);

        const rootId =
            this.getRootId(user);


        this.validate(dto);


        const type =
            await this.getLeaveType(
                rootId,
                dto.leaveTypeId,
            );


        /*
         * Backend is authoritative
         * for leave duration.
         */
        const days =
            this.calculateLeaveDays(
                dto.startDate,
                dto.endDate,
                dto.durationUnit ?? 'day',
            );


        if (
            days <= 0
        ) {

            throw new BadRequestException(
                'Invalid leave duration',
            );
        }


        if (
            days >
            (
                type.maxDaysPerRequest ??
                Infinity
            )
        ) {

            throw new BadRequestException(
                'Maximum leave limit exceeded',
            );
        }


        /*
         * Half-day is allowed only when
         * the leave type explicitly permits it.
         */
        if (
            dto.durationUnit === 'half_day' &&
            type.allowHalfDay !== true
        ) {

            throw new BadRequestException(
                'Half-day leave is not allowed for this leave type',
            );
        }


        /*
         * Check balance using the
         * backend-calculated duration.
         */
        await this.checkBalance(
            userId,
            dto.leaveTypeId,
            days,
        );


        /*
         * Build approval chain once
         * and store it.
         */
        const approval =
            type.requiresApproval
                ? await this.buildApprovalChain(
                    user,
                    type.approvalMode,
                )
                : [];


        const autoApproved =
            !type.requiresApproval ||
            type.approvalMode === 'auto';


        const status =
            autoApproved
                ? 'approved'
                : 'pending';


        const now =
            new Date();


        const ref =
            await this.db
                .collection('leaveRequests')
                .add({

                    userId,

                    userName:
                        user.fullName ||
                        user.email ||
                        userId,

                    rootId,

                    role:
                        user.role,

                    leaveTypeId:
                        dto.leaveTypeId,

                    startDate:
                        dto.startDate,

                    endDate:
                        dto.endDate,

                    /*
                     * Calculated exclusively
                     * by the backend.
                     */
                    days,

                    durationUnit:
                        dto.durationUnit ??
                        'day',

                    reason:
                        dto.reason ??
                        '',

                    status,

                    approval,

                    currentLevel:
                        autoApproved
                            ? null
                            : 0,

                    createdAt:
                        now,

                    updatedAt:
                        now,

                });


        /*
         * Auto-approved leave immediately
         * creates ledger/payroll records.
         */
        if (
            autoApproved
        ) {

            await this.finalizeApprovedLeave(
                ref.id,
                user,
                {
                    ...dto,
                    days,
                },
                type,
            );
        }


        this.logger.log(
            `Leave created | id=${ref.id} | user=${userId} | days=${days}`,
        );


        return {

            success:
                true,

            id:
                ref.id,

            status,

            /*
             * Useful for Flutter confirmation.
             */
            days,

        };
    }


    // ==================================================
    // UPDATE
    // ==================================================

    async update(
        userId: string,
        id: string,
        dto: LeaveDto,
    ) {

        const user =
            await this.getUser(userId);

        const rootId =
            this.getRootId(user);


        this.validate(dto);


        const ref =
            this.db
                .collection('leaveRequests')
                .doc(id);


        const doc =
            await ref.get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Leave request not found',
            );
        }


        const data =
            doc.data()!;


        if (
            data.userId !== userId
        ) {

            throw new BadRequestException(
                'You can only edit your own leave',
            );
        }


        if (
            ![
                'draft',
                'pending',
            ].includes(
                data.status,
            )
        ) {

            throw new BadRequestException(
                'Approved or rejected leave cannot be edited',
            );
        }


        await ref.update({

            ...dto,

            updatedAt:
                new Date(),

        });


        return {
            success: true,
            id,
        };
    }


    // ==================================================
    // CANCEL
    // ==================================================

    async remove(
        userId: string,
        id: string,
    ) {

        const user =
            await this.getUser(userId);

        const rootId =
            this.getRootId(user);


        const ref =
            this.db
                .collection('leaveRequests')
                .doc(id);


        const doc =
            await ref.get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Leave request not found',
            );
        }


        const data =
            doc.data()!;


        if (
            data.userId !== userId
        ) {

            throw new BadRequestException(
                'Permission denied',
            );
        }


        /*
         * Approved leave is never
         * physically deleted.
         *
         * Payroll history must remain.
         */
        if (
            data.status ===
            'approved'
        ) {

            throw new BadRequestException(
                'Approved leave cannot be deleted',
            );
        }


        if (
            data.status ===
            'cancelled'
        ) {

            throw new BadRequestException(
                'Leave is already cancelled',
            );
        }


        await ref.update({

            status:
                'cancelled',

            updatedAt:
                new Date(),

        });


        return {
            success: true,
            id,
        };
    }


    // ==================================================
    // APPROVE
    // ==================================================

    async approve(
        userId: string,
        id: string,
    ) {

        const approver =
            await this.getUser(userId);

        const rootId =
            this.getRootId(approver);


        /*
         * Verify approval permission.
         */
        if (
            !this.isRoot(approver)
        ) {

            const permissions =
                await this.getPermissions(
                    userId,
                );


            if (
                approver.role === 'hr'
            ) {

                if (
                    permissions[
                    'leave.approve.all'
                    ] !== true
                ) {

                    throw new BadRequestException(
                        'Permission denied',
                    );
                }

            } else {

                if (
                    permissions[
                    'leave.approve'
                    ] !== true
                ) {

                    throw new BadRequestException(
                        'Permission denied',
                    );
                }
            }
        }


        const ref =
            this.db
                .collection('leaveRequests')
                .doc(id);


        const doc =
            await ref.get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Leave request not found',
            );
        }


        const data =
            doc.data()!;


        if (
            data.status !==
            'pending'
        ) {

            throw new BadRequestException(
                'Leave is not pending',
            );
        }


        /*
         * Never allow self approval.
         */
        if (
            data.userId === userId
        ) {

            throw new BadRequestException(
                'You cannot approve your own leave',
            );
        }


        const steps =
            data.approval ?? [];


        const level =
            data.currentLevel ?? 0;


        const step =
            steps[level];


        /*
         * The logged-in user must be
         * the actual current approver.
         */
        if (
            !step ||
            step.userId !== userId
        ) {

            throw new BadRequestException(
                'You are not the current approver',
            );
        }


        step.status =
            'approved';

        step.approvedBy =
            userId;

        step.approvedAt =
            new Date();


        const nextLevel =
            level + 1;


        /*
         * More approval levels.
         */
        if (
            nextLevel <
            steps.length
        ) {

            steps[nextLevel].status =
                'pending';


            await ref.update({

                approval:
                    steps,

                currentLevel:
                    nextLevel,

                updatedAt:
                    new Date(),

            });


            return {
                success: true,
                status: 'pending',
            };
        }


        /*
         * Final approval.
         */
        await ref.update({

            approval:
                steps,

            currentLevel:
                null,

            status:
                'approved',

            approvedAt:
                new Date(),

            updatedAt:
                new Date(),

        });


        const type =
            await this.getLeaveType(
                rootId,
                data.leaveTypeId,
            );


        const employee =
            await this.getUser(
                data.userId,
            );


        await this.finalizeApprovedLeave(
            id,
            employee,
            data,
            type,
        );


        this.logger.log(
            `Leave approved | id=${id} | approver=${userId}`,
        );


        return {
            success: true,
            status: 'approved',
        };
    }


    // ==================================================
    // REJECT
    // ==================================================

    async reject(
        userId: string,
        id: string,
        reason?: string,
    ) {

        const approver =
            await this.getUser(userId);

        const rootId =
            this.getRootId(approver);


        /*
         * Verify permission.
         */
        if (
            !this.isRoot(approver)
        ) {

            const permissions =
                await this.getPermissions(
                    userId,
                );


            const permission =
                approver.role === 'hr'
                    ? 'leave.approve.all'
                    : 'leave.approve';


            if (
                permissions[
                permission
                ] !== true
            ) {

                throw new BadRequestException(
                    'Permission denied',
                );
            }
        }


        const ref =
            this.db
                .collection('leaveRequests')
                .doc(id);


        const doc =
            await ref.get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Leave request not found',
            );
        }


        const data =
            doc.data()!;


        if (
            data.status !==
            'pending'
        ) {

            throw new BadRequestException(
                'Leave is not pending',
            );
        }


        /*
         * Self rejection is also
         * not allowed.
         */
        if (
            data.userId === userId
        ) {

            throw new BadRequestException(
                'You cannot reject your own leave',
            );
        }


        const level =
            data.currentLevel ?? 0;


        const step =
            data.approval?.[level];


        if (
            !step ||
            step.userId !== userId
        ) {

            throw new BadRequestException(
                'You are not the current approver',
            );
        }


        step.status =
            'rejected';

        step.rejectedBy =
            userId;

        step.rejectedAt =
            new Date();


        await ref.update({

            approval:
                data.approval,

            currentLevel:
                null,

            status:
                'rejected',

            rejectionReason:
                reason ??
                '',

            updatedAt:
                new Date(),

        });


        this.logger.log(
            `Leave rejected | id=${id} | approver=${userId}`,
        );


        return {
            success: true,
            status: 'rejected',
        };
    }


    // ==================================================
    // LEAVE TYPES
    // ==================================================

    async getTypes(
        userId: string,
    ) {

        const user =
            await this.getUser(userId);

        const rootId =
            this.getRootId(user);


        const snap =
            await this.db
                .collection('leaveTypes')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'active',
                    '==',
                    true,
                )
                .get();


        return {
            types:
                snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                })),
        };
    }


    // ==================================================
    // CREATE LEAVE TYPE
    // ==================================================

    // ==================================================
    // CREATE LEAVE TYPE
    // ==================================================

    async createType(
        userId: string,
        dto: LeaveTypeDto,
    ) {

        const user =
            await this.getUser(
                userId,
            );


        const allowed =
            await this.canManageLeaveTypes(
                user,
            );


        if (!allowed) {

            throw new BadRequestException(
                'Permission denied',
            );
        }


        const rootId =
            this.getRootId(
                user,
            );

        const name =
            dto.name
                .trim();


        const code =
            dto.code
                .trim()
                .toUpperCase();


        // /*
        //  * Name uniqueness.
        //  */
        // const nameSnap =
        //     await this.db
        //         .collection('leaveTypes')
        //         .where(
        //             'rootId',
        //             '==',
        //             rootId,
        //         )
        //         .where(
        //             'name',
        //             '==',
        //             name,
        //         )
        //         .limit(1)
        //         .get();


        // if (
        //     !nameSnap.empty
        // ) {

        //     throw new BadRequestException(
        //         'Leave type name already exists',
        //     );
        // }


        /*
         * Code uniqueness.
         */
        const codeSnap =
            await this.db
                .collection('leaveTypes')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .where(
                    'code',
                    '==',
                    code,
                )
                .limit(1)
                .get();


        if (
            !codeSnap.empty
        ) {

            throw new BadRequestException(
                'Leave type code already exists',
            );
        }


        const ref =
            await this.db
                .collection('leaveTypes')
                .add({

                    ...dto,

                    name,

                    code,

                    rootId,

                    active:
                        true,

                    createdAt:
                        new Date(),

                    updatedAt:
                        new Date(),

                });


        this.logger.log(
            `Leave type created | id=${ref.id} | user=${userId}`,
        );


        return {

            success:
                true,

            id:
                ref.id,

        };
    }


    // ==================================================
    // DEACTIVATE LEAVE TYPE
    // ==================================================

    async deactivateType(
        userId: string,
        id: string,
    ) {

        const user =
            await this.getUser(
                userId,
            );


        const allowed =
            await this.canManageLeaveTypes(
                user,
            );


        if (!allowed) {

            throw new BadRequestException(
                'Permission denied',
            );
        }


        const ref =
            this.db
                .collection('leaveTypes')
                .doc(id);


        const doc =
            await ref.get();


        if (!doc.exists) {

            throw new NotFoundException(
                'Leave type not found',
            );
        }


        const data =
            doc.data()!;


        if (
            data.rootId !==
            this.getRootId(user)
        ) {

            throw new BadRequestException(
                'Permission denied',
            );
        }


        if (
            data.active !== true
        ) {

            throw new BadRequestException(
                'Leave type is already inactive',
            );
        }


        await ref.update({

            active:
                false,

            updatedAt:
                new Date(),

        });


        return {

            success:
                true,

            id,

        };
    }

    // ==================================================
    // REACTIVATE LEAVE TYPE
    // ==================================================

    async reactivateType(
        userId: string,
        id: string,
    ) {

        const user =
            await this.getUser(
                userId,
            );


        const allowed =
            await this.canManageLeaveTypes(
                user,
            );


        if (!allowed) {

            throw new BadRequestException(
                'Permission denied',
            );
        }


        const ref =
            this.db
                .collection('leaveTypes')
                .doc(id);


        const doc =
            await ref.get();


        if (!doc.exists) {

            throw new NotFoundException(
                'Leave type not found',
            );
        }


        const data =
            doc.data()!;


        if (
            data.rootId !==
            this.getRootId(user)
        ) {

            throw new BadRequestException(
                'Permission denied',
            );
        }


        if (
            data.active === true
        ) {

            throw new BadRequestException(
                'Leave type is already active',
            );
        }


        await ref.update({

            active:
                true,

            updatedAt:
                new Date(),

        });


        return {

            success:
                true,

            id,

        };
    }

    // ==================================================
    // GET MANAGEABLE LEAVE TYPES
    // ==================================================

    async getManageableTypes(
        userId: string,
    ) {

        const user =
            await this.getUser(
                userId,
            );


        const allowed =
            await this.canManageLeaveTypes(
                user,
            );


        if (!allowed) {

            throw new BadRequestException(
                'Permission denied',
            );
        }


        const rootId =
            this.getRootId(
                user,
            );


        const snap =
            await this.db
                .collection('leaveTypes')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .get();


        return {

            types:
                snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                })),

        };
    }

    // ==================================================
    // CAN MANAGE LEAVE TYPES
    // ==================================================

    private async canManageLeaveTypes(
        user: any,
    ): Promise<boolean> {

        if (
            user.role ===
            'root_manager'
        ) {

            return true;
        }


        if (
            user.role ===
            'root_hr'
        ) {

            const permissions =
                await this.getPermissions(
                    user.uid,
                );


            return (
                permissions[
                'leave.type.manage'
                ] === true
            );
        }


        return false;
    }

    // ==================================================
    // LEAVE TYPE ACCESS
    // ==================================================

    async getTypeAccess(
        userId: string,
    ) {

        const user =
            await this.getUser(
                userId,
            );


        /*
         * Only Root Manager automatically
         * has leave type management access.
         */
        if (
            user.role ===
            'root_manager'
        ) {

            return {

                canView:
                    true,

                canManage:
                    true,

            };
        }


        /*
         * Root HR requires explicit permission
         * granted by Root Manager.
         */
        if (
            user.role ===
            'root_hr'
        ) {

            const permissions =
                await this.getPermissions(
                    user.uid,
                );


            const allowed =
                permissions[
                'leave.type.manage'
                ] === true;


            return {

                canView:
                    allowed,

                canManage:
                    allowed,

            };
        }


        /*
         * Nobody else can even see
         * Leave Type management.
         */
        return {

            canView:
                false,

            canManage:
                false,

        };
    }

    // ==================================================
    // APPROVAL CHAIN
    // ==================================================

    private async buildApprovalChain(
        user: any,
        mode: string,
    ) {

        if (
            mode === 'auto'
        ) {

            return [];
        }


        const chain: any[] = [];


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


            if (
                this.getRootId(current) !==
                this.getRootId(parent)
            ) {

                throw new BadRequestException(
                    'Invalid hierarchy',
                );
            }


            /*
             * HR is not part of
             * Manager approval hierarchy.
             */
            if (
                [
                    'hr',
                    'root_hr',
                ].includes(
                    parent.role,
                )
            ) {

                current =
                    parent;

                continue;
            }


            /*
             * Only Manager hierarchy
             * becomes approval chain.
             */
            chain.push({

                level:
                    chain.length,

                userId:
                    parent.uid,

                role:
                    parent.role,

                status:
                    chain.length === 0
                        ? 'pending'
                        : 'waiting',

            });


            current =
                parent;


            /*
             * One level.
             */
            if (
                mode ===
                'one_level'
            ) {

                break;
            }


            /*
             * Two levels.
             */
            if (
                mode ===
                'two_level' &&
                chain.length >= 2
            ) {

                break;
            }


            /*
             * Continue until root.
             */
            if (
                mode === 'root' &&
                this.isRoot(current)
            ) {

                break;
            }
        }


        /*
         * No manager found.
         *
         * This is intentionally an error
         * instead of silently auto approving.
         */
        if (
            !chain.length
        ) {

            throw new BadRequestException(
                'No valid approver found',
            );
        }


        /*
         * First approver must have
         * approval permission.
         *
         * Otherwise the leave would
         * become permanently stuck.
         */
        for (
            const step of chain
        ) {

            if (
                this.isRoot(
                    await this.getUser(
                        step.userId,
                    ),
                )
            ) {

                continue;
            }


            const permissions =
                await this.getPermissions(
                    step.userId,
                );


            if (
                permissions[
                'leave.approve'
                ] !== true
            ) {

                throw new BadRequestException(
                    'Approver does not have leave approval permission',
                );
            }
        }


        return chain;
    }


    // ==================================================
    // FINALIZE APPROVED LEAVE
    // ==================================================

    private async finalizeApprovedLeave(
        leaveId: string,
        user: any,
        data: any,
        type: any,
    ) {

        const batch =
            this.db.batch();


        /*
         * Leave ledger.
         */
        const ledger =
            this.db
                .collection('leaveLedger')
                .doc();


        batch.set(
            ledger,
            {

                rootId:
                    this.getRootId(user),

                userId:
                    user.uid,

                leaveRequestId:
                    leaveId,

                leaveTypeId:
                    data.leaveTypeId,

                transactionType:
                    'DEBIT',

                days:
                    data.days,

                createdAt:
                    new Date(),

            },
        );


        /*
         * Payroll impact.
         *
         * Payroll calculates the
         * actual monetary amount.
         */
        const payroll =
            this.db
                .collection('payrollAdjustments')
                .doc();


        batch.set(
            payroll,
            {

                rootId:
                    this.getRootId(user),

                userId:
                    user.uid,

                sourceType:
                    'LEAVE',

                sourceId:
                    leaveId,

                leaveTypeId:
                    data.leaveTypeId,

                days:
                    type.isPaid
                        ? 0
                        : data.days,

                adjustmentType:
                    type.deductSalary
                        ? 'DEDUCTION'
                        : 'NONE',

                status:
                    'pending',

                createdAt:
                    new Date(),

            },
        );


        await batch.commit();
    }


    // ==================================================
    // BALANCE
    // ==================================================

    private async checkBalance(
        userId: string,
        leaveTypeId: string,
        days: number,
    ) {

        const snap =
            await this.db
                .collection('leaveBalances')
                .where(
                    'userId',
                    '==',
                    userId,
                )
                .where(
                    'leaveTypeId',
                    '==',
                    leaveTypeId,
                )
                .limit(1)
                .get();


        /*
         * No balance record means
         * balance management has not
         * been initialized yet.
         */
        if (
            snap.empty
        ) {

            return;
        }


        const balance =
            snap.docs[0].data();


        const remaining =
            balance.remaining ?? 0;


        if (
            remaining < days
        ) {

            throw new BadRequestException(
                'Insufficient leave balance',
            );
        }
    }


    // ==================================================
    // LEAVE TYPE
    // ==================================================

    private async getLeaveType(
        rootId: string,
        id: string,
    ) {

        const doc =
            await this.db
                .collection('leaveTypes')
                .doc(id)
                .get();


        if (
            !doc.exists ||
            doc.data()?.rootId !== rootId
        ) {

            throw new NotFoundException(
                'Leave type not found',
            );
        }


        const data =
            doc.data()!;


        if (
            data.active !== true
        ) {

            throw new BadRequestException(
                'Leave type is inactive',
            );
        }


        return {
            id: doc.id,
            ...data,
        } as any;
    }


    // ==================================================
    // AUTHORIZATION
    // ==================================================

    private async authorize(
        user: any,
        permission: string,
    ) {

        /*
         * Root authority.
         */
        if (
            this.isRoot(user)
        ) {

            return;
        }


        /*
         * HR uses explicit HR
         * permissions.
         */
        if (
            user.role === 'hr'
        ) {

            const permissions =
                await this.getPermissions(
                    user.uid,
                );


            if (
                permissions[
                permission
                ] !== true
            ) {

                throw new BadRequestException(
                    'Permission denied',
                );
            }


            return;
        }


        /*
         * Field Executive has
         * no administrative authority.
         */
        if (
            user.role ===
            'field_executive'
        ) {

            throw new BadRequestException(
                'Executive has no management permission',
            );
        }


        const permissions =
            await this.getPermissions(
                user.uid,
            );


        if (
            permissions[
            permission
            ] !== true
        ) {

            throw new BadRequestException(
                'Permission denied',
            );
        }


        /*
         * Parent authority cannot
         * be weaker than child authority.
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


            if (
                this.getRootId(current) !==
                this.getRootId(parent)
            ) {

                throw new BadRequestException(
                    'Invalid hierarchy',
                );
            }


            /*
             * Root ends authority chain.
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


            if (
                permissions[
                permission
                ] !== true
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
    // DESCENDANTS
    // ==================================================

    private async getDescendantIds(
        user: any,
    ): Promise<Set<string>> {

        const rootId =
            this.getRootId(user);


        const snap =
            await this.db
                .collection('user')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .get();


        const children =
            new Map<
                string,
                any[]
            >();


        for (
            const doc of snap.docs
        ) {

            const data =
                doc.data();


            if (
                !data.parentId
            ) {

                continue;
            }


            const list =
                children.get(
                    data.parentId,
                ) ?? [];


            list.push({

                uid:
                    doc.id,

                ...data,

            });


            children.set(
                data.parentId,
                list,
            );
        }


        const result =
            new Set<string>();


        const visited =
            new Set<string>();


        const walk =
            (parentId: string) => {

                if (
                    visited.has(parentId)
                ) {

                    return;
                }


                visited.add(
                    parentId,
                );


                const users =
                    children.get(
                        parentId,
                    ) ?? [];


                for (
                    const child of users
                ) {

                    if (
                        child.rootId !==
                        rootId
                    ) {

                        continue;
                    }


                    result.add(
                        child.uid,
                    );


                    /*
                     * HR does not become
                     * a new hierarchy.
                     */
                    if (
                        child.role ===
                        'hr'
                    ) {

                        continue;
                    }


                    walk(
                        child.uid,
                    );
                }
            };


        walk(
            user.uid,
        );


        return result;
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


        if (
            !doc.exists
        ) {

            throw new NotFoundException(
                'User not found',
            );
        }


        return {
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

        if (
            this.isRoot(user)
        ) {

            return (
                user.rootId ||
                user.uid
            );
        }


        if (
            !user.rootId
        ) {

            throw new BadRequestException(
                'Invalid hierarchy',
            );
        }


        return user.rootId;
    }

    private calculateLeaveDays(
        startDate: string,
        endDate: string,
        durationUnit: string,
    ): number {

        const start =
            new Date(startDate);

        const end =
            new Date(endDate);


        if (
            isNaN(start.getTime()) ||
            isNaN(end.getTime())
        ) {

            throw new BadRequestException(
                'Invalid leave date',
            );
        }


        /*
         * Calendar dates are normalized
         * so timezone/time components do
         * not affect the calculation.
         */
        const startDay =
            Date.UTC(
                start.getUTCFullYear(),
                start.getUTCMonth(),
                start.getUTCDate(),
            );


        const endDay =
            Date.UTC(
                end.getUTCFullYear(),
                end.getUTCMonth(),
                end.getUTCDate(),
            );


        const calendarDays =
            Math.floor(
                (
                    endDay -
                    startDay
                ) /
                (
                    1000 *
                    60 *
                    60 *
                    24
                ),
            ) + 1;


        if (
            calendarDays <= 0
        ) {

            throw new BadRequestException(
                'End date cannot be before start date',
            );
        }


        switch (
        durationUnit
        ) {

            case 'day':

                return calendarDays;


            case 'half_day':

                /*
                 * Half-day currently represents
                 * one half-day leave request.
                 */
                if (
                    calendarDays !== 1
                ) {

                    throw new BadRequestException(
                        'Half-day leave must be for one day',
                    );
                }

                return 0.5;


            case 'hour':

                /*
                 * Hourly leave requires an
                 * explicit hour quantity.
                 *
                 * Since LeaveDto currently has
                 * no hours field, do not allow
                 * this unit yet.
                 */
                throw new BadRequestException(
                    'Hourly leave requires an hour duration',
                );


            default:

                throw new BadRequestException(
                    'Invalid leave duration unit',
                );
        }
    }


    // ==================================================
    // VALIDATE
    // ==================================================

    private validate(
        dto: LeaveDto,
    ) {

        if (
            !dto.leaveTypeId?.trim()
        ) {

            throw new BadRequestException(
                'Leave type is required',
            );
        }


        const start =
            new Date(
                dto.startDate,
            );


        const end =
            new Date(
                dto.endDate,
            );


        if (
            isNaN(start.getTime()) ||
            isNaN(end.getTime())
        ) {

            throw new BadRequestException(
                'Invalid leave date',
            );
        }


        if (
            end < start
        ) {

            throw new BadRequestException(
                'End date cannot be before start date',
            );
        }


        const durationUnit =
            dto.durationUnit ??
            'day';


        if (
            ![
                'day',
                'half_day',
                'hour',
            ].includes(
                durationUnit,
            )
        ) {

            throw new BadRequestException(
                'Invalid leave duration unit',
            );
        }
    }
}