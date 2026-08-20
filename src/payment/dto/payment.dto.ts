import {
    IsIn,
    IsOptional,
    IsString,
} from 'class-validator';

export class PaymentDto {

    @IsString()
    payrollRecordId!: string;

    @IsIn([
        'cash',
        'bank_transfer',
        'upi',
        'cheque',
        'other',
    ])
    paymentMethod!: string;

    @IsOptional()
    @IsString()
    transactionId?: string;

    @IsOptional()
    @IsString()
    remarks?: string;

}