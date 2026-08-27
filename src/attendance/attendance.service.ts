import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import {
    FieldValue,
    Timestamp,
} from 'firebase-admin/firestore';

import { FirebaseService } from '../firebase/firebase.service';

import { AttendanceDto } from './dto/attendance.dto';

import {
    AttendanceStatus,
    LeaveInfo,
    ProcessingSummary,
    RunLog,
    ShiftConfig,
    Staff,
    UserDocument,
} from './interfaces/attendance-processing.interface';

@Injectable()
export class AttendanceService {

    private readonly logger =
        new Logger(AttendanceService.name);

    private static readonly TIME_ZONE =
        'Asia/Kolkata';

    private static readonly BATCH_SIZE = 450;

    /*
     * These roles are organization authorities,
     * not attendance staff.
     *
     * HR staff should use "hr" (or the existing
     * non-root HR role), not root_hr.
     */
    private static readonly ATTENDANCE_ROLES =
        new Set([
            'field_executive',
            'manager',
            'hr',
        ]);

    constructor(
        private readonly firebase: FirebaseService,
    ) { }

    private get db() {
        return this.firebase.firestore;
    }

    // ============================================================
    // EXISTING ATTENDANCE API
    // ============================================================

    async getData(
        requesterId: string,
        dto: AttendanceDto,
    ) {
        const requester =
            await this.getUser(requesterId);

        const rootId =
            this.getRootId(requester);

        await this.verifyStaff(
            rootId,
            dto.staffId,
        );

        const start =
            new Date(
                dto.year,
                dto.month - 1,
                1,
            );

        const end =
            new Date(
                dto.year,
                dto.month,
                1,
            );

        try {

            const snapshot =
                await this.db
                    .collection('attendance')
                    .doc(dto.staffId)
                    .collection('records')
                    .where(
                        'date',
                        '>=',
                        start,
                    )
                    .where(
                        'date',
                        '<',
                        end,
                    )
                    .get();

            const records =
                snapshot.docs.map(
                    doc => this.mapRecord(doc),
                );

            return {
                records,
                summary:
                    this.getSummary(records),
            };

        } catch (error) {

            this.logger.error(
                `Attendance fetch failed | staff=${dto.staffId} | ${dto.year}-${dto.month}`,
                error instanceof Error
                    ? error.stack
                    : String(error),
            );

            throw error;
        }
    }

    async getMyData(
        userId: string,
        month: number,
        year: number,
    ) {

        const user =
            await this.getUser(userId);

        const start =
            new Date(
                year,
                month - 1,
                1,
            );

        const end =
            new Date(
                year,
                month,
                1,
            );

        const snapshot =
            await this.db
                .collection('attendance')
                .doc(userId)
                .collection('records')
                .where(
                    'date',
                    '>=',
                    start,
                )
                .where(
                    'date',
                    '<',
                    end,
                )
                .get();

        const records =
            snapshot.docs.map(
                doc => this.mapRecord(doc),
            );

        return {
            records,
            summary:
                this.getSummary(records),
        };
    }

    // ============================================================
    // MANUAL / SCHEDULER ENTRY POINT
    // ============================================================

    async processAttendanceForDate(
        date: string,
        options: {
            mode: 'automatic' | 'manual';
            triggeredBy: string;
            rootId?: string;
        },

    ) {

        this.logger.log(
            `[ATTENDANCE] START | date=${date} | mode=${options.mode} | triggeredBy=${options.triggeredBy}`,
        );

        this.validateProcessingDate(date);

        /*
         * Automatic execution processes every organization.
         *
         * Manual execution is always organization scoped.
         */
        if (options.rootId) {

            return this.processOrganizationDate(
                options.rootId,
                date,
                options.mode,
                options.triggeredBy,
            );
        }

        const staff =
            await this.loadAttendanceStaff();

        const grouped =
            this.groupByRootId(staff);

        const results: ProcessingSummary[] = [];

        for (const [rootId] of grouped) {

            const result =
                await this.processOrganizationDate(
                    rootId,
                    date,
                    options.mode,
                    options.triggeredBy,
                );

            this.logger.log(
                `[ATTENDANCE] ORGANIZATION COMPLETE | root=${rootId} | date=${date} | processed=${result.processed} | created=${result.created} | updated=${result.updated} | skipped=${result.skipped} | errors=${result.errors.length}`,
            );

            results.push(result);
        }

        return this.mergeSummaries(
            date,
            results,
        );
    }

    // ============================================================
    // ORGANIZATION PROCESSOR
    // ============================================================

    private async processOrganizationDate(
        rootId: string,
        date: string,
        mode: 'automatic' | 'manual',
        triggeredBy: string,
    ): Promise<ProcessingSummary> {

        const lock =
            await this.acquireRun(
                rootId,
                date,
                mode,
                triggeredBy,
            );

        if (!lock) {
            throw new ConflictException(
                `Attendance processing is already running for ${date}`,
            );
        }

        const summary: ProcessingSummary = {
            date,
            processed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            errors: [],
        };

        try {

            const staff =
                (
                    await this.loadAttendanceStaff()
                ).filter(
                    x =>
                        x.rootId === rootId,
                );

            if (!staff.length) {

                await this.completeRun(
                    rootId,
                    date,
                    summary,
                );

                return summary;
            }

            /*
             * Shared data is loaded once for this organization.
             */
            const teams =
                await this.loadTeams(staff);

            const shifts =
                await this.loadShifts(
                    staff,
                    teams,
                );

            const holidays =
                await this.loadHoliday(
                    rootId,
                    date,
                );

            const leaves =
                await this.loadApprovedLeaves(
                    rootId,
                    date,
                );

            const attendance =
                await this.loadAttendanceRecords(
                    staff,
                    date,
                );

            /*
             * Build all decisions in memory first.
             */
            const operations: Array<{
                staff: Staff;
                ref: FirebaseFirestore.DocumentReference;
                existing?: FirebaseFirestore.DocumentData;
                update?: FirebaseFirestore.DocumentData;
                create?: FirebaseFirestore.DocumentData;
            }> = [];

            for (const employee of staff) {

                summary.processed++;

                try {

                    const shift =
                        this.resolveShift(
                            employee,
                            teams,
                            shifts,
                        );

                    const existing =
                        attendance.get(
                            employee.uid,
                        );

                    const leave =
                        leaves.get(
                            employee.uid,
                        );

                    const decision =
                        this.calculateAttendance(
                            employee,
                            date,
                            shift,
                            existing,
                            leave,
                            holidays,
                        );

                    const ref =
                        this.db
                            .collection('attendance')
                            .doc(employee.uid)
                            .collection('records')
                            .doc(this.dateKey(date));

                    if (
                        decision.action ===
                        'skip'
                    ) {

                        summary.skipped++;

                        continue;
                    }

                    if (
                        decision.action ===
                        'create'
                    ) {

                        summary.created++;

                        operations.push({
                            staff: employee,
                            ref,
                            create:
                                decision.data,
                        });

                    } else {

                        summary.updated++;

                        operations.push({
                            staff: employee,
                            ref,
                            existing,
                            update:
                                decision.data,
                        });
                    }

                } catch (error) {

                    summary.errors.push({
                        staffId:
                            employee.uid,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });

                    this.logger.error(
                        `Attendance staff processing failed | root=${rootId} | staff=${employee.uid} | date=${date}`,
                        error instanceof Error
                            ? error.stack
                            : String(error),
                    );
                }
            }

            /*
             * Only fields owned by the scheduler are changed.
             *
             * checkInTime/checkOutTime/workingMinutes are never
             * blindly overwritten.
             */
            await this.commitOperations(
                operations,
            );

            await this.completeRun(
                rootId,
                date,
                summary,
            );

            return summary;

        } catch (error) {

            await this.failRun(
                rootId,
                date,
                summary,
                error,
            );

            throw error;
        }
    }

    // ============================================================
    // STAFF LOADING
    // ============================================================

    private async loadAttendanceStaff(): Promise<Staff[]> {

        const snapshot =
            await this.db
                .collection('user')
                .where(
                    'isActive',
                    '==',
                    true,
                )
                .get();

        return snapshot.docs
            .map(doc => {
                const data =
                    doc.data();

                return {
                    uid: doc.id,
                    rootId:
                        data.rootId,
                    role:
                        data.role,
                    parentId:
                        data.parentId,
                    teamId:
                        data.teamId,
                    shiftId:
                        data.shiftId,
                    isActive:
                        data.isActive,
                    userName:
                        data.userName ??
                        data.name,
                };
            })
            .filter(
                user =>
                    !!user.rootId &&
                    AttendanceService
                        .ATTENDANCE_ROLES
                        .has(user.role ?? ''),
            );
    }

    private groupByRootId(
        staff: Staff[],
    ) {
        const map =
            new Map<string, Staff[]>();

        for (const user of staff) {

            const current =
                map.get(user.rootId) ?? [];

            current.push(user);

            map.set(
                user.rootId,
                current,
            );
        }

        return map;
    }

    // ============================================================
    // TEAM PRELOAD
    // ============================================================

    private async loadTeams(
        staff: Staff[],
    ): Promise<
        Map<string, FirebaseFirestore.DocumentData>
    > {

        const ids =
            [
                ...new Set(
                    staff
                        .map(x => x.teamId)
                        .filter(
                            (
                                x,
                            ): x is string =>
                                !!x,
                        ),
                ),
            ];

        if (!ids.length) {
            return new Map();
        }

        const refs =
            ids.map(
                id =>
                    this.db
                        .collection('teams')
                        .doc(id),
            );

        const snapshots =
            await this.db.getAll(
                ...refs,
            );

        return new Map(
            snapshots
                .filter(
                    snapshot =>
                        snapshot.exists,
                )
                .map(
                    snapshot => [
                        snapshot.id,
                        snapshot.data()!,
                    ],
                ),
        );
    }

    // ============================================================
    // SHIFT PRELOAD
    // ============================================================

    private async loadShifts(
        staff: Staff[],
        teams: Map<
            string,
            FirebaseFirestore.DocumentData
        >,
    ): Promise<
        Map<string, ShiftConfig>
    > {

        const ids =
            new Set<string>();

        for (const user of staff) {

            /*
             * IMPORTANT:
             *
             * direct shiftId wins.
             */
            if (user.shiftId) {

                ids.add(
                    user.shiftId,
                );

                continue;
            }

            if (user.teamId) {

                const team =
                    teams.get(
                        user.teamId,
                    );

                if (team?.shiftId) {

                    ids.add(
                        team.shiftId,
                    );
                }
            }
        }

        if (!ids.size) {
            return new Map();
        }

        const refs =
            [...ids].map(
                id =>
                    this.db
                        .collection('shifts')
                        .doc(id),
            );

        const snapshots =
            await this.db.getAll(
                ...refs,
            );

        const result =
            new Map<string, ShiftConfig>();

        for (const snapshot of snapshots) {

            if (!snapshot.exists) {
                continue;
            }

            const data =
                snapshot.data()!;

            result.set(
                snapshot.id,
                {
                    shiftId:
                        snapshot.id,

                    startHour:
                        Number(
                            data.startHour ?? 0,
                        ),

                    startMinute:
                        Number(
                            data.startMinute ?? 0,
                        ),

                    endHour:
                        Number(
                            data.endHour ?? 0,
                        ),

                    endMinute:
                        Number(
                            data.endMinute ?? 0,
                        ),

                    graceMinutes:
                        Number(
                            data.graceMinutes ?? 0,
                        ),

                    halfDayMinutes:
                        Number(
                            data.halfDayMinutes ?? 240,
                        ),

                    fullDayMinutes:
                        Number(
                            data.fullDayMinutes ?? 480,
                        ),

                    weeklyOff:
                        Array.isArray(
                            data.weeklyOff,
                        )
                            ? data.weeklyOff
                            : [],
                },
            );
        }

        return result;
    }

    // ============================================================
    // SHIFT RESOLUTION
    // ============================================================

    private resolveShift(
        staff: Staff,
        teams: Map<
            string,
            FirebaseFirestore.DocumentData
        >,
        shifts: Map<string, ShiftConfig>,
    ): ShiftConfig | undefined {

        /*
         * MANAGER / HR:
         *
         * user.shiftId
         */
        if (staff.shiftId) {

            return shifts.get(
                staff.shiftId,
            );
        }

        /*
         * EXECUTIVE / TEAM BASED:
         *
         * user.teamId
         *      ->
         * teams.shiftId
         *      ->
         * shifts
         */
        if (staff.teamId) {

            const team =
                teams.get(
                    staff.teamId,
                );

            if (team?.shiftId) {

                return shifts.get(
                    team.shiftId,
                );
            }
        }

        return undefined;
    }

    // ============================================================
    // HOLIDAY PRELOAD
    // ============================================================

    private async loadHoliday(
        rootId: string,
        date: string,
    ): Promise<boolean> {

        /*
         * Query only the organization.
         *
         * We filter date/active in memory to avoid introducing
         * another composite index dependency.
         */
        const snapshot =
            await this.db
                .collection(
                    'companyHolidays',
                )
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .get();

        return snapshot.docs.some(
            doc => {

                const data =
                    doc.data();

                return (
                    data.active === true &&
                    data.date === date
                );
            },
        );
    }

    // ============================================================
    // LEAVE PRELOAD
    // ============================================================

    private async loadApprovedLeaves(
        rootId: string,
        date: string,
    ): Promise<
        Map<string, LeaveInfo>
    > {

        const snapshot =
            await this.db
                .collection('leaves')
                .where(
                    'rootId',
                    '==',
                    rootId,
                )
                .get();

        const result =
            new Map<string, LeaveInfo>();

        for (const doc of snapshot.docs) {

            const data =
                doc.data();

            if (
                String(
                    data.status ?? '',
                ).toLowerCase() !==
                'approved'
            ) {
                continue;
            }

            if (
                !data.startDate ||
                !data.endDate
            ) {
                continue;
            }

            if (
                date <
                String(
                    data.startDate,
                ) ||
                date >
                String(
                    data.endDate,
                )
            ) {
                continue;
            }

            const duration =
                data.duration ===
                    'half_day'
                    ? 'half_day'
                    : 'day';

            result.set(
                data.userId,
                {
                    userId:
                        data.userId,
                    leaveTypeId:
                        data.leaveTypeId,
                    startDate:
                        data.startDate,
                    endDate:
                        data.endDate,
                    days:
                        data.days,
                    status:
                        data.status,
                    duration,
                },
            );
        }

        return result;
    }

    // ============================================================
    // ATTENDANCE PRELOAD
    // ============================================================

    private async loadAttendanceRecords(
        staff: Staff[],
        date: string,
    ): Promise<
        Map<string, FirebaseFirestore.DocumentData>
    > {

        const refs =
            staff.map(
                user =>
                    this.db
                        .collection('attendance')
                        .doc(user.uid)
                        .collection('records')
                        .doc(this.dateKey(date)),
            );

        const result =
            new Map<
                string,
                FirebaseFirestore.DocumentData
            >();

        /*
         * Keep getAll chunks modest for large organizations.
         */
        for (
            let i = 0;
            i < refs.length;
            i += 100
        ) {

            const chunk =
                refs.slice(
                    i,
                    i + 100,
                );

            const snapshots =
                await this.db.getAll(
                    ...chunk,
                );

            for (
                let index = 0;
                index < snapshots.length;
                index++
            ) {

                const snapshot =
                    snapshots[index];

                if (
                    snapshot.exists
                ) {

                    result.set(
                        staff[
                            i + index
                        ].uid,
                        snapshot.data()!,
                    );
                }
            }
        }

        return result;
    }

    // ============================================================
    // BUSINESS DECISION
    // ============================================================

    private calculateAttendance(
        staff: Staff,
        date: string,
        shift: ShiftConfig | undefined,
        existing:
            | FirebaseFirestore.DocumentData
            | undefined,
        leave:
            | LeaveInfo
            | undefined,
        holiday: boolean,
    ):
        | {
            action: 'skip';
        }
        | {
            action: 'create';
            data: FirebaseFirestore.DocumentData;
        }
        | {
            action: 'update';
            data: FirebaseFirestore.DocumentData;
        } {

        /*
         * No shift means we cannot safely classify attendance.
         */
        if (!shift) {

            if (existing) {

                return {
                    action: 'skip',
                };
            }

            throw new Error(
                'No applicable shift found',
            );
        }

        /*
         * Existing check-in/check-out wins.
         */
        if (
            existing?.checkInTime &&
            existing?.checkOutTime
        ) {

            return {
                action: 'update',
                data:
                    this.classifyCompletedAttendance(
                        existing,
                        shift,
                        leave,
                    ),
            };
        }

        /*
         * Existing "working" is intentionally preserved.
         *
         * We do not fabricate checkoutTime or
         * workingMinutes.
         */
        if (
            existing?.checkInTime &&
            !existing?.checkOutTime
        ) {

            return {
                action: 'skip',
            };
        }

        /*
         * Existing historical terminal record is preserved.
         */
        if (
            existing &&
            this.isTerminalStatus(
                existing.status,
            )
        ) {

            return {
                action: 'skip',
            };
        }

        /*
         * Approved full-day leave.
         */
        if (
            leave &&
            leave.duration !==
            'half_day'
        ) {

            return {
                action:
                    existing
                        ? 'update'
                        : 'create',

                data:
                    this.leaveRecord(
                        staff,
                        date,
                        shift,
                        leave,
                    ),
            };
        }

        /*
         * Approved half-day leave.
         *
         * No attendance means the record represents the
         * approved half-day leave. The remaining half is not
         * silently converted into absent.
         */
        if (
            leave?.duration ===
            'half_day'
        ) {

            return {
                action:
                    existing
                        ? 'update'
                        : 'create',

                data:
                    this.halfDayLeaveRecord(
                        staff,
                        date,
                        shift,
                        leave,
                    ),
            };
        }

        /*
         * Company holiday.
         */
        if (holiday) {

            return {
                action:
                    existing
                        ? 'update'
                        : 'create',

                data: {
                    staffId:
                        staff.uid,

                    date:
                        this.localDate(
                            date,
                        ),

                    status:
                        'holiday',

                    workingMinutes: 0,

                    shiftSnapshot:
                        shift,

                    rootId:
                        staff.rootId,
                },
            };
        }

        /*
         * Weekly off.
         */
        if (
            this.isWeeklyOff(
                date,
                shift,
            )
        ) {

            return {
                action:
                    existing
                        ? 'update'
                        : 'create',

                data: {
                    staffId:
                        staff.uid,

                    date:
                        this.localDate(
                            date,
                        ),

                    status:
                        'weekly_off',

                    workingMinutes: 0,

                    shiftSnapshot:
                        shift,

                    rootId:
                        staff.rootId,
                },
            };
        }

        /*
         * No attendance on normal working day.
         */
        return {
            action:
                existing
                    ? 'update'
                    : 'create',

            data: {
                staffId:
                    staff.uid,

                date:
                    this.localDate(
                        date,
                    ),

                status:
                    'absent',

                workingMinutes: 0,

                shiftSnapshot:
                    shift,

                rootId:
                    staff.rootId,
            },
        };
    }

    // ============================================================
    // COMPLETED ATTENDANCE CLASSIFICATION
    // ============================================================

    private classifyCompletedAttendance(
        attendance:
            FirebaseFirestore.DocumentData,
        shift: ShiftConfig,
        leave?: LeaveInfo,
    ) {

        const checkIn =
            this.toDate(
                attendance.checkInTime,
            );

        const checkOut =
            this.toDate(
                attendance.checkOutTime,
            );

        if (!checkIn || !checkOut) {
            return {};
        }

        const actualMinutes =
            Math.max(
                0,
                Math.round(
                    (
                        checkOut.getTime() -
                        checkIn.getTime()
                    ) / 60000,
                ),
            );

        /*
         * Keep actual duration.
         *
         * Never add graceMinutes.
         */
        const workingMinutes =
            Number.isFinite(
                Number(
                    attendance.workingMinutes,
                ),
            )
                ? Number(
                    attendance.workingMinutes,
                )
                : actualMinutes;

        const shiftStart =
            this.shiftStartForDate(
                checkIn,
                shift,
            );

        const late =
            checkIn.getTime() >
            (
                shiftStart.getTime() +
                shift.graceMinutes *
                60000
            );

        let status:
            AttendanceStatus;

        if (
            workingMinutes >=
            shift.fullDayMinutes
        ) {

            status =
                late
                    ? 'late'
                    : 'present';

        } else if (
            workingMinutes >=
            shift.halfDayMinutes
        ) {

            status =
                'half_day';

        } else {

            status =
                'absent';
        }

        const update: Record<
            string,
            unknown
        > = {

            status,

            /*
             * Preserve actual working time.
             */
            workingMinutes,

            updatedAt:
                FieldValue.serverTimestamp(),
        };

        /*
         * Do not replace the historical shiftSnapshot.
         */
        if (!attendance.shiftSnapshot) {

            update.shiftSnapshot =
                shift;
        }

        /*
         * Half-day leave + actual attendance:
         *
         * preserve attendance classification and attach
         * the leave information rather than changing it
         * to full-day leave.
         */
        if (
            leave?.duration ===
            'half_day'
        ) {

            update.leaveDuration =
                'half_day';

            update.leaveTypeId =
                leave.leaveTypeId;
        }

        return update;
    }

    // ============================================================
    // LEAVE RECORDS
    // ============================================================

    private leaveRecord(
        staff: Staff,
        date: string,
        shift: ShiftConfig,
        leave: LeaveInfo,
    ) {

        return {
            staffId:
                staff.uid,

            date:
                this.localDate(date),

            status:
                'leave',

            leaveDuration:
                'day',

            leaveTypeId:
                leave.leaveTypeId,

            workingMinutes:
                0,

            shiftSnapshot:
                shift,

            rootId:
                staff.rootId,

            updatedAt:
                FieldValue.serverTimestamp(),
        };
    }

    private halfDayLeaveRecord(
        staff: Staff,
        date: string,
        shift: ShiftConfig,
        leave: LeaveInfo,
    ) {

        return {
            staffId:
                staff.uid,

            date:
                this.localDate(date),

            status:
                'leave',

            leaveDuration:
                'half_day',

            leaveTypeId:
                leave.leaveTypeId,

            workingMinutes:
                0,

            shiftSnapshot:
                shift,

            rootId:
                staff.rootId,

            updatedAt:
                FieldValue.serverTimestamp(),
        };
    }

    // ============================================================
    // WRITE OPERATIONS
    // ============================================================

    private async commitOperations(
        operations: Array<{
            ref: FirebaseFirestore.DocumentReference;
            create?: FirebaseFirestore.DocumentData;
            update?: FirebaseFirestore.DocumentData;
        }>,
    ) {

        for (
            let i = 0;
            i < operations.length;
            i += AttendanceService.BATCH_SIZE
        ) {

            const chunk =
                operations.slice(
                    i,
                    i +
                    AttendanceService
                        .BATCH_SIZE,
                );

            const batch =
                this.db.batch();

            for (const operation of chunk) {

                if (operation.create) {

                    batch.set(
                        operation.ref,
                        {
                            ...operation.create,

                            createdAt:
                                FieldValue
                                    .serverTimestamp(),

                            updatedAt:
                                FieldValue
                                    .serverTimestamp(),
                        },
                        {
                            merge: true,
                        },
                    );

                } else if (
                    operation.update
                ) {

                    /*
                     * merge=true is critical:
                     *
                     * checkInTime,
                     * checkOutTime,
                     * existing fields,
                     * legacy executiveId
                     *
                     * are not destroyed.
                     */
                    batch.set(
                        operation.ref,
                        operation.update,
                        {
                            merge: true,
                        },
                    );
                }
            }

            await batch.commit();
        }
    }

    // ============================================================
    // RUN LOCK / AUDIT LOG
    // ============================================================

    private runRef(
        rootId: string,
        date: string,
    ) {

        return this.db
            .collection(
                'attendanceSchedulerRuns',
            )
            .doc(
                `${rootId}_${this.dateKey(date)}`,
            );
    }

    private async acquireRun(
        rootId: string,
        date: string,
        mode: 'automatic' | 'manual',
        triggeredBy: string,
    ): Promise<boolean> {

        const ref =
            this.runRef(
                rootId,
                date,
            );

        return this.db.runTransaction(
            async transaction => {

                const snapshot =
                    await transaction.get(
                        ref,
                    );

                if (snapshot.exists) {

                    const data =
                        snapshot.data()!;

                    if (
                        data.status ===
                        'running'
                    ) {

                        return false;
                    }
                }

                const run:
                    RunLog = {
                    rootId,
                    date,
                    mode,
                    triggeredBy,
                    status:
                        'running',
                    startedAt:
                        null,
                    completedAt:
                        null,
                    processedStaff:
                        0,
                    created:
                        0,
                    updated:
                        0,
                    skipped:
                        0,
                    errors:
                        0,
                };

                transaction.set(
                    ref,
                    {
                        ...run,

                        startedAt:
                            FieldValue
                                .serverTimestamp(),

                        completedAt:
                            null,
                    },
                    {
                        merge: true,
                    },
                );

                return true;
            },
        );
    }

    private async completeRun(
        rootId: string,
        date: string,
        summary: ProcessingSummary,
    ) {

        await this.runRef(
            rootId,
            date,
        ).set(
            {
                status:
                    summary.errors.length
                        ? 'partial_failed'
                        : 'completed',

                completedAt:
                    FieldValue
                        .serverTimestamp(),

                processedStaff:
                    summary.processed,

                created:
                    summary.created,

                updated:
                    summary.updated,

                skipped:
                    summary.skipped,

                errors:
                    summary.errors.length,
            },
            {
                merge: true,
            },
        );
    }

    private async failRun(
        rootId: string,
        date: string,
        summary: ProcessingSummary,
        error: unknown,
    ) {

        await this.runRef(
            rootId,
            date,
        ).set(
            {
                status:
                    'failed',

                completedAt:
                    FieldValue
                        .serverTimestamp(),

                processedStaff:
                    summary.processed,

                created:
                    summary.created,

                updated:
                    summary.updated,

                skipped:
                    summary.skipped,

                errors:
                    summary.errors.length + 1,

                fatalError:
                    error instanceof Error
                        ? error.message
                        : String(error),
            },
            {
                merge: true,
            },
        );
    }

    // ============================================================
    // AUTHORIZATION
    // ============================================================

    async assertCanProcess(
        userId: string,
    ) {

        const user = await this.getUser(userId);

        const allowed =
            new Set([
                'root',
                'admin',
                'root_manager',
                'root_hr',
            ]);

        if (
            !allowed.has(
                user.role!,
            )
        ) {

            throw new ForbiddenException(
                'You are not authorized to process attendance',
            );
        }

        return {
            ...user,
            rootId:
                this.getRootId(user),
        };
    }

    // ============================================================
    // USER HELPERS
    // ============================================================

    private async getUser(userId: string): Promise<UserDocument> {

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

        const data =
            doc.data() ?? {};

        return {
            uid: doc.id,
            ...(data as Omit<
                UserDocument,
                'uid'
            >),
        };
    }

    private getRootId(
        user: any,
    ): string {

        /*
         * Normal users and root authorities should normally
         * already contain rootId.
         *
         * Root itself can safely fall back to its own UID.
         */
        return (
            user.rootId ??
            (
                user.role === 'root'
                    ? user.uid
                    : undefined
            )
        );
    }

    private async verifyStaff(
        rootId: string,
        staffId: string,
    ) {

        const doc =
            await this.db
                .collection('user')
                .doc(staffId)
                .get();

        const data =
            doc.data();

        if (
            !doc.exists ||
            data?.rootId !== rootId
        ) {

            this.logger.warn(
                `Staff validation failed | staff=${staffId} | root=${rootId}`,
            );

            throw new NotFoundException(
                'Staff not found',
            );
        }
    }

    // ============================================================
    // DATE HELPERS
    // ============================================================

    private validateProcessingDate(
        date: string,
    ) {


        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(
                date,
            )
        ) {

            throw new BadRequestException(
                'date must be YYYY-MM-DD',
            );
        }

        const parsed =
            new Date(
                `${date}T00:00:00+05:30`,
            );

        if (
            Number.isNaN(
                parsed.getTime(),
            )
        ) {

            throw new BadRequestException(
                'Invalid processing date',
            );
        }

        /*
         * Attendance processing only handles completed days.
         *
         * Today and future dates are rejected.
         */
        const today =
            this.todayIndia();

        if (date >= today) {

            throw new BadRequestException(
                'Attendance can only be processed for a completed date',
            );
        }
    }

    private todayIndia(): string {

        const formatter =
            new Intl.DateTimeFormat(
                'en-CA',
                {
                    timeZone:
                        AttendanceService
                            .TIME_ZONE,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                },
            );

        return formatter.format(
            new Date(),
        );
    }

    private dateKey(
        date: string,
    ): string {

        return date.replace(
            /-/g,
            '',
        );
    }

    private localDate(
        date: string,
    ): Date {

        return new Date(
            `${date}T00:00:00+05:30`,
        );
    }

    private shiftStartForDate(
        checkIn: Date,
        shift: ShiftConfig,
    ): Date {

        const result =
            new Date(checkIn);

        result.setHours(
            shift.startHour,
            shift.startMinute,
            0,
            0,
        );

        return result;
    }

    private isWeeklyOff(
        date: string,
        shift: ShiftConfig,
    ): boolean {

        const day =
            new Intl.DateTimeFormat(
                'en-US',
                {
                    timeZone:
                        AttendanceService
                            .TIME_ZONE,
                    weekday:
                        'long',
                },
            ).format(
                this.localDate(date),
            );

        return shift.weeklyOff.includes(
            day,
        );
    }

    // ============================================================
    // DATA HELPERS
    // ============================================================

    private toDate(
        value: any,
    ): Date | null {

        if (!value) {
            return null;
        }

        if (
            value instanceof Date
        ) {
            return value;
        }

        if (
            value instanceof Timestamp
        ) {
            return value.toDate();
        }

        if (
            typeof value.toDate ===
            'function'
        ) {
            return value.toDate();
        }

        const date =
            new Date(value);

        return Number.isNaN(
            date.getTime(),
        )
            ? null
            : date;
    }

    private isTerminalStatus(
        status: string | undefined,
    ) {

        return new Set([
            'present',
            'late',
            'half_day',
            'absent',
            'leave',
            'weekly_off',
            'holiday',
        ]).has(
            status ?? '',
        );
    }

    private mapRecord(
        doc: FirebaseFirestore.QueryDocumentSnapshot,
    ) {

        const data =
            doc.data();

        return {
            id: doc.id,
            date:
                data.date ?? null,
            checkInTime:
                data.checkInTime ?? null,
            checkOutTime:
                data.checkOutTime ?? null,
            workingMinutes:
                data.workingMinutes ?? 0,
            status:
                data.status ?? 'absent',
        };
    }

    private getSummary(
        records: any[],
    ) {

        return {

            totalPresent:
                records.filter(
                    x =>
                        x.status ===
                        'present',
                ).length,

            totalLate:
                records.filter(
                    x =>
                        x.status ===
                        'late',
                ).length,

            totalHalfDay:
                records.filter(
                    x =>
                        x.status ===
                        'half_day',
                ).length,

            totalWeeklyOff:
                records.filter(
                    x =>
                        x.status ===
                        'weekly_off',
                ).length,

            totalHoliday:
                records.filter(
                    x =>
                        x.status ===
                        'holiday',
                ).length,

            totalLeave:
                records.filter(
                    x =>
                        x.status ===
                        'leave',
                ).length,

            totalAbsent:
                records.filter(
                    x =>
                        x.status ===
                        'absent',
                ).length,

            totalWorkingMinutes:
                records.reduce(
                    (
                        sum,
                        x,
                    ) =>
                        sum +
                        (
                            Number(
                                x.workingMinutes,
                            ) || 0
                        ),
                    0,
                ),
        };
    }

    // ============================================================
    // SUMMARY MERGE
    // ============================================================

    private mergeSummaries(
        date: string,
        summaries: ProcessingSummary[],
    ): ProcessingSummary {

        return {
            date,

            processed:
                summaries.reduce(
                    (a, b) =>
                        a + b.processed,
                    0,
                ),

            created:
                summaries.reduce(
                    (a, b) =>
                        a + b.created,
                    0,
                ),

            updated:
                summaries.reduce(
                    (a, b) =>
                        a + b.updated,
                    0,
                ),

            skipped:
                summaries.reduce(
                    (a, b) =>
                        a + b.skipped,
                    0,
                ),

            errors:
                summaries.flatMap(
                    x => x.errors,
                ),
        };
    }
}