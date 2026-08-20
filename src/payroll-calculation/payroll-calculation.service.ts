import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class PayrollCalculationService {

  constructor(
    private readonly firebase:
      FirebaseService,
  ) { }


  private get db() {
    return this.firebase.firestore;
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

      uid:
        doc.id,

      ...doc.data(),

    } as any;

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


    if (!user.rootId) {

      throw new BadRequestException(
        'Invalid hierarchy',
      );

    }


    return user.rootId;

  }


  // ==================================================
  // AUTHORIZATION
  // ==================================================

  private async authorize(
    uid: string,
  ) {

    const user =
      await this.getUser(
        uid,
      );


    if (
      ![
        'root_manager',
        'root_hr',
      ].includes(
        user.role,
      )
    ) {

      throw new BadRequestException(
        'Permission denied',
      );

    }


    return {

      user,

      rootId:
        this.getRootId(
          user,
        ),

    };

  }


  // ==================================================
  // PERIOD
  // ==================================================

  private async getPeriod(
    rootId: string,
    id: string,
  ) {

    const doc =
      await this.db
        .collection(
          'payrollPeriods',
        )
        .doc(id)
        .get();


    if (
      !doc.exists ||
      doc.data()?.rootId !== rootId
    ) {

      throw new NotFoundException(
        'Payroll period not found',
      );

    }


    return {

      id:
        doc.id,

      ...doc.data(),

    } as any;

  }


  // ==================================================
  // DATE
  // ==================================================

  private dates(
    start: string,
    end: string,
  ) {

    const result: string[] = [];

    const date =
      new Date(
        `${start}T00:00:00.000Z`,
      );


    const last =
      new Date(
        `${end}T00:00:00.000Z`,
      );


    while (
      date <= last
    ) {

      result.push(
        date
          .toISOString()
          .slice(
            0,
            10,
          ),
      );


      date.setUTCDate(
        date.getUTCDate() + 1,
      );

    }


    return result;

  }


  private dayOfWeek(
    date: string,
  ) {

    return new Date(
      `${date}T00:00:00.000Z`,
    ).getUTCDay();

  }


  // ==================================================
  // STAFF
  // ==================================================

  private async getStaff(
    rootId: string,
  ) {

    const snap =
      await this.db
        .collection('user')
        .where(
          'rootId',
          '==',
          rootId,
        )
        .get();


    return snap.docs
      .map(doc => ({

        uid:
          doc.id,

        ...doc.data(),

      }))
      .filter(
        (user: any) =>
          ![
            'root',
            'admin',
          ].includes(
            user.role,
          ),
      ) as any[];

  }


  // ==================================================
  // SALARY ASSIGNMENT
  // ==================================================

  private async getAssignment(
    rootId: string,
    employeeId: string,
    startDate: string,
    endDate: string,
  ): Promise<any> {

    const snap =
      await this.db
        .collection('salaryAssignments')
        .where(
          'rootId',
          '==',
          rootId,
        )
        .where(
          'employeeId',
          '==',
          employeeId,
        )
        .get();


    const assignments =
      snap.docs
        .map(doc => ({

          id:
            doc.id,

          ...doc.data(),

        }))
        .filter(
          (item: any) =>
            item.active !== false &&
            item.effectiveFrom <=
            endDate,
        )
        .sort(
          (
            a: any,
            b: any,
          ) =>
            b.effectiveFrom.localeCompare(
              a.effectiveFrom,
            ),
        );


    return assignments[0] || null;

  }


  // ==================================================
  // SALARY STRUCTURE
  // ==================================================

  private async getStructure(
    rootId: string,
    id: string,
  ) {

    if (!id) {
      return null;
    }


    const doc =
      await this.db
        .collection(
          'salaryStructures',
        )
        .doc(id)
        .get();


    if (
      !doc.exists ||
      doc.data()?.rootId !== rootId
    ) {

      throw new NotFoundException(
        'Salary structure not found',
      );

    }


    return {

      id:
        doc.id,

      ...doc.data(),

    } as any;

  }


  // ==================================================
  // ATTENDANCE
  // ==================================================

  private async getAttendance(
    employeeId: string,
    startDate: string,
    endDate: string,
  ) {

    const start =
      new Date(
        `${startDate}T00:00:00.000Z`,
      );


    const end =
      new Date(
        `${endDate}T23:59:59.999Z`,
      );


    const snap =
      await this.db
        .collection('attendance')
        .doc(employeeId)
        .collection('records')
        .where(
          'date',
          '>=',
          start,
        )
        .where(
          'date',
          '<=',
          end,
        )
        .get();


    const result =
      new Map<string, any>();


    snap.docs.forEach(
      doc => {

        const data =
          doc.data();


        let date = '';


        if (
          data.date?.toDate
        ) {

          date =
            data.date
              .toDate()
              .toISOString()
              .slice(
                0,
                10,
              );

        } else {

          date =
            new Date(
              data.date,
            )
              .toISOString()
              .slice(
                0,
                10,
              );

        }


        result.set(
          date,
          data,
        );

      },
    );


    return result;

  }


  // ==================================================
  // TEAM / SHIFT
  // ==================================================

  private async getShift(
    rootId: string,
    employee: any,
  ) {

    let shiftId =
      employee.shiftId ||
      '';


    /*
     * Employee-level shift wins.
     */
    if (!shiftId && employee.teamId) {

      const team =
        await this.db
          .collection('teams')
          .doc(employee.teamId)
          .get();


      if (
        team.exists &&
        team.data()?.rootId === rootId
      ) {

        shiftId =
          team.data()?.shiftId ||
          '';

      }

    }


    if (!shiftId) {
      return null;
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

      return null;
    }


    return {

      id:
        doc.id,

      ...doc.data(),

    } as any;

  }


  // ==================================================
  // WEEKLY OFF
  // ==================================================

  private isWeeklyOff(
    shift: any,
    date: string,
  ) {

    if (!shift) {
      return false;
    }


    const weeklyOff =
      shift.weeklyOff;


    if (
      Array.isArray(
        weeklyOff,
      )
    ) {

      const day =
        this.dayOfWeek(
          date,
        );


      return weeklyOff.some(
        (item: any) => {

          if (
            typeof item ===
            'number'
          ) {

            return item === day;

          }


          const value =
            String(
              item,
            )
              .toLowerCase()
              .trim();


          const names = [

            'sunday',
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',

          ];


          return (
            value ===
            names[day]
          );

        },
      );

    }


    if (
      typeof weeklyOff ===
      'string'
    ) {

      const day =
        this.dayOfWeek(
          date,
        );


      const names = [

        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',

      ];


      return (
        weeklyOff
          .toLowerCase()
          .trim() ===
        names[day]
      );

    }


    return false;

  }


  // ==================================================
  // HOLIDAYS
  // ==================================================

  private async getHolidays(
    rootId: string,
    startDate: string,
    endDate: string,
  ) {

    const snap =
      await this.db
        .collection(
          'companyHolidays',
        )
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


    return new Set(
      snap.docs
        .map(
          doc =>
            doc.data().date,
        )
        .filter(
          date =>
            date >= startDate &&
            date <= endDate,
        ),
    );

  }


  // ==================================================
  // LEAVE
  // ==================================================

  private async getLeaves(
    rootId: string,
    employeeId: string,
    startDate: string,
    endDate: string,
  ) {

    const [
      leaveSnap,
      typeSnap,
    ] =
      await Promise.all([

        this.db
          .collection(
            'leaveRequests',
          )
          .where(
            'rootId',
            '==',
            rootId,
          )
          .where(
            'userId',
            '==',
            employeeId,
          )
          .where(
            'status',
            '==',
            'approved',
          )
          .get(),

        this.db
          .collection(
            'leaveTypes',
          )
          .where(
            'rootId',
            '==',
            rootId,
          )
          .get(),

      ]);


    const types =
      new Map<string, any>(
        typeSnap.docs.map(
          doc => [
            doc.id,
            doc.data(),
          ],
        ),
      );


    const leaves: any[] = [];


    leaveSnap.docs.forEach(
      doc => {

        const leave =
          doc.data();


        if (
          leave.endDate <
          startDate ||
          leave.startDate >
          endDate
        ) {

          return;

        }


        const type =
          types.get(
            leave.leaveTypeId,
          ) || {};


        leaves.push({

          ...leave,

          id:
            doc.id,

          isPaid:
            type.isPaid === true,

          deductSalary:
            type.deductSalary === true,

        });

      },
    );


    return leaves;

  }


  // ==================================================
  // LEAVE DAY MAP
  // ==================================================

  private buildLeaveMap(
    leaves: any[],
  ) {

    const map =
      new Map<string, any>();


    for (
      const leave
      of leaves
    ) {

      const start =
        leave.startDate;


      const end =
        leave.endDate;


      for (
        const date
        of this.dates(
          start,
          end,
        )
      ) {

        /*
         * Later leave requests should
         * not overwrite an existing
         * payroll day.
         */
        if (
          !map.has(date)
        ) {

          map.set(
            date,
            leave,
          );

        }

      }

    }


    return map;

  }


  // ==================================================
  // CALCULATE EMPLOYEE
  // ==================================================

  private async calculateEmployee(
    rootId: string,
    employee: any,
    period: any,
    holidays: Set<string>,
  ) {

    const assignment =
      await this.getAssignment(
        rootId,
        employee.uid,
        period.startDate,
        period.endDate,
      );


    if (!assignment) {
      return null;
    }


    const structure =
      await this.getStructure(
        rootId,
        assignment.salaryStructureId,
      );


    if (!structure) {
      return null;
    }


    const [
      attendance,
      leaves,
      shift,
    ] =
      await Promise.all([

        this.getAttendance(
          employee.uid,
          period.startDate,
          period.endDate,
        ),

        this.getLeaves(
          rootId,
          employee.uid,
          period.startDate,
          period.endDate,
        ),

        this.getShift(
          rootId,
          employee,
        ),

      ]);


    const leaveMap =
      this.buildLeaveMap(
        leaves,
      );


    const dates =
      this.dates(
        period.startDate,
        period.endDate,
      );


    let workingDays = 0;
    let payableDays = 0;
    let weeklyOff = 0;
    let holidayDays = 0;
    let paidLeave = 0;
    let unpaidLeave = 0;
    let present = 0;
    let late = 0;
    let halfDay = 0;
    let absent = 0;
    let workingMinutes = 0;


    for (
      const date
      of dates
    ) {

      const isOff =
        this.isWeeklyOff(
          shift,
          date,
        );


      const isHoliday =
        holidays.has(
          date,
        );


      const leave =
        leaveMap.get(
          date,
        );


      const record =
        attendance.get(
          date,
        );


      /*
       * Weekly off.
       */
      if (isOff) {

        weeklyOff++;

        continue;

      }


      /*
       * Company holiday.
       */
      if (isHoliday) {

        holidayDays++;

        continue;

      }


      workingDays++;


      /*
       * Approved leave.
       */
      if (leave) {

        if (
          leave.isPaid &&
          !leave.deductSalary
        ) {

          paidLeave++;
          payableDays++;

        } else {

          unpaidLeave++;

        }

        continue;

      }


      /*
       * Attendance.
       */
      const status =
        record?.status ||
        'absent';


      if (
        status ===
        'present'
      ) {

        present++;
        payableDays++;

      } else if (
        status ===
        'late'
      ) {

        late++;
        payableDays++;

      } else if (
        status ===
        'half_day'
      ) {

        halfDay++;
        payableDays += 0.5;

      } else if (
        status ===
        'weekly_off'
      ) {

        weeklyOff++;

      } else {

        absent++;

      }


      workingMinutes +=
        Number(
          record?.workingMinutes ||
          0,
        );

    }


    /*
     * Read the salary components
     * without modifying the salary
     * structure itself.
     */
    const basic =
      Number(
        structure.basic ||
        0,
      );


    const hra =
      Number(
        structure.hra ||
        0,
      );


    const conveyance =
      Number(
        structure.conveyance ||
        0,
      );


    const otherAllowance =
      Number(
        structure.otherAllowance ||
        structure.allowance ||
        0,
      );


    const incentive =
      Number(
        structure.incentive ||
        0,
      );


    const pf =
      Number(
        structure.pf ||
        0,
      );


    const esi =
      Number(
        structure.esi ||
        0,
      );


    const tax =
      Number(
        structure.tax ||
        0,
      );


    const otherDeduction =
      Number(
        structure.otherDeduction ||
        structure.deduction ||
        0,
      );


    const grossSalary =
      basic +
      hra +
      conveyance +
      otherAllowance +
      incentive;


    const totalDeduction =
      pf +
      esi +
      tax +
      otherDeduction;


    /*
     * Salary is prorated against
     * calendar working days.
     *
     * Weekly offs and company holidays
     * are not treated as absences.
     */
    const salaryBaseDays =
      workingDays +
      weeklyOff +
      holidayDays;


    const payableRatio =
      salaryBaseDays > 0
        ? payableDays /
        salaryBaseDays
        : 0;


    const payableGross =
      Math.round(
        grossSalary *
        payableRatio *
        100,
      ) / 100;


    const payableDeduction =
      Math.round(
        totalDeduction *
        payableRatio *
        100,
      ) / 100;


    const netSalary =
      Math.max(
        0,
        payableGross -
        payableDeduction,
      );


    return {

      employeeId:
        employee.uid,

      employeeName:
        employee.fullName ||
        employee.email ||
        employee.uid,

      role:
        employee.role,

      salaryAssignmentId:
        assignment.id,

      salaryStructureId:
        assignment.salaryStructureId,

      effectiveFrom:
        assignment.effectiveFrom,

      shiftId:
        shift?.id ||
        employee.shiftId ||
        null,

      salary: {

        basic,

        hra,

        conveyance,

        otherAllowance,

        incentive,

        pf,

        esi,

        tax,

        otherDeduction,

        grossSalary,

        totalDeduction,

        payableGross,

        payableDeduction,

        netSalary,

      },

      attendance: {

        present,

        late,

        halfDay,

        absent,

        weeklyOff,

        workingMinutes,

      },

      leave: {

        paid:
          paidLeave,

        unpaid:
          unpaidLeave,

      },

      holidays:
        holidayDays,

      workingDays,

      payableDays,

      status:
        'calculated',

      calculatedAt:
        new Date(),

      createdAt:
        new Date(),

      updatedAt:
        new Date(),

    };

  }


  // ==================================================
  // CALCULATE
  // ==================================================

  async calculate(
    userId: string,
    periodId: string,
  ) {

    const {
      rootId,
    } =
      await this.authorize(
        userId,
      );


    const period =
      await this.getPeriod(
        rootId,
        periodId,
      );


    if (
      period.status ===
      'closed'
    ) {

      throw new BadRequestException(
        'Closed payroll period cannot be recalculated',
      );

    }


    const employees =
      await this.getStaff(
        rootId,
      );


    const holidays =
      await this.getHolidays(
        rootId,
        period.startDate,
        period.endDate,
      );


    const records: any[] = [];


    for (
      const employee
      of employees
    ) {

      const record =
        await this.calculateEmployee(
          rootId,
          employee,
          period,
          holidays,
        );


      if (
        !record
      ) {

        continue;

      }


      records.push(
        record,
      );

    }


    /*
     * Remove previous calculated
     * records for this period before
     * writing the new snapshot.
     */
    const existing =
      await this.db
        .collection(
          'payrollRecords',
        )
        .where(
          'rootId',
          '==',
          rootId,
        )
        .where(
          'payrollPeriodId',
          '==',
          periodId,
        )
        .get();


    const batch =
      this.db.batch();


    existing.docs.forEach(
      doc =>
        batch.delete(
          doc.ref,
        ),
    );


    records.forEach(
      record => {

        const ref =
          this.db
            .collection(
              'payrollRecords',
            )
            .doc();


        batch.set(
          ref,
          {

            rootId,

            payrollPeriodId:
              periodId,

            ...record,

          },
        );

      },
    );


    await batch.commit();


    return {

      success:
        true,

      payrollPeriodId:
        periodId,

      totalEmployees:
        records.length,

      records,

    };

  }


  // ==================================================
  // GET CALCULATIONS
  // ==================================================

  async getAll(
    userId: string,
    periodId: string,
  ) {

    const {
      rootId,
    } =
      await this.authorize(
        userId,
      );


    await this.getPeriod(
      rootId,
      periodId,
    );


    const snap =
      await this.db
        .collection(
          'payrollRecords',
        )
        .where(
          'rootId',
          '==',
          rootId,
        )
        .where(
          'payrollPeriodId',
          '==',
          periodId,
        )
        .get();


    return {

      records:
        snap.docs.map(
          doc => ({

            id:
              doc.id,

            ...doc.data(),

          }),
        ),

    };

  }

}