import { Types, type HydratedDocument } from 'mongoose';
import { RentCharge, type RentChargeDocument } from '../../database/models/RentCharge.js';
import { Payment } from '../../database/models/Payment.js';
import { PaymentDestination } from '../../database/models/PaymentDestination.js';
import { PaymentAllocation } from '../../database/models/PaymentAllocation.js';
import { Expense } from '../../database/models/Expense.js';
import { ServiceChargeAssessment } from '../../database/models/ServiceChargeAssessment.js';
import { ArrearsCase } from '../../database/models/ArrearsCase.js';
import { FinancialPeriod } from '../../database/models/FinancialPeriod.js';
import { Tenancy } from '../../database/models/Tenancy.js';
import { Tenant } from '../../database/models/Tenant.js';
import { Property } from '../../database/models/Property.js';
import { Contractor } from '../../database/models/Contractor.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AppError } from '../../core/errors/AppError.js';
import { AuditService } from '../audit/audit.service.js';
import { PaystackProvider } from '../../core/integrations/paystack.provider.js';
import { integrationConfig } from '../../core/integrations/config.js';
import { assertMatchingCurrency } from '../../core/money/legacy-finance.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { AllocationInput, ArrearsActionInput, ExpenseInput, GenerateRentInput, PeriodInput, PaymentDestinationInput, PaymentInput, RentChargeInput, ReportInput, ServiceChargeInput } from './finance.schemas.js';

const activeTenancyStatuses = { $in: ['ACTIVE', 'NOTICE'] as const };
const toId = (value: string) => new Types.ObjectId(value);
const resourceFor = (doc: { organizationId: Types.ObjectId; propertyId: Types.ObjectId; buildingId?: Types.ObjectId | null; unitId?: Types.ObjectId | null }, ownerUserId?: Types.ObjectId) => ({ organizationId: doc.organizationId, propertyId: doc.propertyId, ...(doc.buildingId ? { buildingId: doc.buildingId } : {}), ...(doc.unitId ? { unitId: doc.unitId } : {}), ...(ownerUserId ? { ownerUserId } : {}) });

export class FinanceService {
  static async listRent(auth: AuthenticatedUser, organizationId: string) {
    const orgId=toId(organizationId); AuthorizationService.assertPermission(auth,'rent.view',orgId); const ids=await ResourceScopeService.scopedUnitIds(auth,orgId); const filter:Record<string,unknown>={organizationId:orgId}; if(ids) filter.unitId={$in:ids};
    await RentCharge.updateMany({organizationId:orgId,dueDate:{$lt:new Date()},balanceAmount:{$gt:0},status:{$in:['OPEN','PARTIALLY_PAID']}},{status:'OVERDUE'});
    return RentCharge.find(filter).sort({dueDate:-1}).lean();
  }

  private static async tenancyFor(auth:AuthenticatedUser, tenancyId:string, permission:string) {
    const tenancy=await Tenancy.findById(tenancyId); if(!tenancy) throw new AppError(404,'TENANCY_NOT_FOUND','Tenancy not found');
    const tenant=await Tenant.findById(tenancy.tenantId).lean(); ResourceScopeService.assertUnit(auth,tenancy,permission,tenant?.userId); return {tenancy,tenant};
  }

  static async createRent(auth:AuthenticatedUser, organizationId:string, data:RentChargeInput) {
    const orgId=toId(organizationId); AuthorizationService.assertPermission(auth,'rent.manage',orgId); const {tenancy}=await this.tenancyFor(auth,data.tenancyId,'rent.manage');
    if(String(tenancy.organizationId)!==String(orgId)) throw new AppError(403,'ORGANIZATION_ACCESS_DENIED','Tenancy does not belong to this organization');
    if(!['ACTIVE','NOTICE'].includes(tenancy.status)) throw new AppError(409,'TENANCY_INACTIVE','Rent can only be charged to an active tenancy');
    const total=data.rentAmount+data.serviceChargeAmount+data.adjustments; const charge=await RentCharge.create({organizationId:orgId,...data,propertyId:tenancy.propertyId,buildingId:tenancy.buildingId,floorId:tenancy.floorId,unitId:tenancy.unitId,tenantId:tenancy.tenantId,tenancyId:tenancy._id,totalAmount:total,balanceAmount:total,status:'OPEN',createdBy:auth.userId,updatedBy:auth.userId}); return charge;
  }

  static async generateRent(auth:AuthenticatedUser, organizationId:string, data:GenerateRentInput) {
    const orgId=toId(organizationId); AuthorizationService.assertPermission(auth,'rent.manage',orgId); const ids=await ResourceScopeService.scopedUnitIds(auth,orgId); const filter:Record<string,unknown>={organizationId:orgId,status:activeTenancyStatuses}; if(ids) filter.unitId={$in:ids};
    const tenancies=await Tenancy.find(filter).lean(); const created:unknown[]=[];
    for(const tenancy of tenancies){
      const exists=await RentCharge.exists({organizationId:orgId,tenancyId:tenancy._id,periodStart:data.periodStart}); if(exists) continue;
      const total=tenancy.monthlyRent+tenancy.serviceCharge; const charge=await RentCharge.create({organizationId:orgId,propertyId:tenancy.propertyId,buildingId:tenancy.buildingId,floorId:tenancy.floorId,unitId:tenancy.unitId,tenantId:tenancy.tenantId,tenancyId:tenancy._id,periodStart:data.periodStart,periodEnd:data.periodEnd,dueDate:data.dueDate,rentAmount:tenancy.monthlyRent,serviceChargeAmount:tenancy.serviceCharge,adjustments:0,totalAmount:total,balanceAmount:total,currency:data.currency,status:'OPEN',createdBy:auth.userId,updatedBy:auth.userId}); created.push(charge);
    }
    return created;
  }

  static async getRent(auth:AuthenticatedUser,id:string){const c=await RentCharge.findById(id);if(!c)throw new AppError(404,'NOT_FOUND','Rent charge not found');const tenant=await Tenant.findById(c.tenantId).lean();ResourceScopeService.assertUnit(auth,c,'rent.view',tenant?.userId);return c;}

  static async listPayments(auth:AuthenticatedUser,organizationId:string){const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'payment.view',orgId);const ids=await ResourceScopeService.scopedUnitIds(auth,orgId);const filter:Record<string,unknown>={organizationId:orgId};if(ids)filter.unitId={$in:ids};return Payment.find(filter).sort({createdAt:-1}).lean();}

  static async createPayment(auth:AuthenticatedUser,organizationId:string,data:PaymentInput){const orgId=toId(organizationId);const {tenancy,tenant}=await this.tenancyFor(auth,data.tenancyId,'payment.create');if(String(tenancy.organizationId)!==String(orgId))throw new AppError(403,'ORGANIZATION_ACCESS_DENIED','Tenancy does not belong to this organization');const payment=await Payment.create({organizationId:orgId,...data,propertyId:tenancy.propertyId,buildingId:tenancy.buildingId,floorId:tenancy.floorId,unitId:tenancy.unitId,tenantId:tenant?._id ?? tenancy.tenantId,tenancyId:tenancy._id,status:'PENDING',createdBy:auth.userId,updatedBy:auth.userId});return payment;}

  static async listPaymentDestinations(auth:AuthenticatedUser,organizationId:string){const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'organization.settings.manage',orgId);return PaymentDestination.find({organizationId:orgId}).sort({isDefault:-1,createdAt:-1}).lean();}

  static async createPaymentDestination(auth:AuthenticatedUser,organizationId:string,data:PaymentDestinationInput){
    const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'organization.settings.manage',orgId);
    let providerFields:Record<string,unknown>;let status:'ACTIVE'|'PENDING_PROVIDER_SETUP'='PENDING_PROVIDER_SETUP';let verified=false;
    if(data.provider==='PAYSTACK'){
      const subaccount=await new PaystackProvider().createSubaccount({businessName:data.businessName,bankCode:data.bankCode,accountNumber:data.accountNumber,percentageCharge:data.percentageCharge,primaryContactEmail:data.contactEmail,primaryContactPhone:data.contactPhone,metadata:{organizationId}});
      status=subaccount.active?'ACTIVE':'PENDING_PROVIDER_SETUP';verified=Boolean(subaccount.is_verified);
      providerFields={paystackSubaccountCode:subaccount.subaccount_code,settlementBankCode:data.bankCode,accountName:subaccount.account_name??subaccount.business_name,accountNumberLast4:data.accountNumber.slice(-4)};
    }else if(data.provider==='MPESA'){
      status=integrationConfig.mpesa.enabled&&integrationConfig.mpesa.shortCode===data.shortCode?'ACTIVE':'PENDING_PROVIDER_SETUP';verified=status==='ACTIVE';
      providerFields={mpesaShortCode:data.shortCode,mpesaAccountReference:data.accountReference};
    }else{
      providerFields={cryptoAsset:data.asset,cryptoNetwork:data.network,cryptoWalletAddress:data.walletAddress};
    }
    const destination=await PaymentDestination.create({organizationId:orgId,provider:data.provider,label:data.label,status,isDefault:false,currency:data.currency,country:data.country,...providerFields,...(verified?{providerVerifiedAt:new Date()}:{}),createdBy:auth.userId,updatedBy:auth.userId});
    if(data.isDefault){await PaymentDestination.updateMany({_id:{$ne:destination._id},organizationId:orgId,provider:data.provider,isDefault:true},{isDefault:false,updatedBy:auth.userId});destination.isDefault=true;await destination.save();}
    await AuditService.record({organizationId:orgId,actorUserId:auth.userId,action:'payment.destination.created',resourceType:'PaymentDestination',resourceId:destination._id,metadata:{provider:data.provider,status}});
    return destination;
  }

  static async disablePaymentDestination(auth:AuthenticatedUser,id:string){const destination=await PaymentDestination.findById(id);if(!destination)throw new AppError(404,'PAYMENT_DESTINATION_NOT_FOUND','Payment destination not found');AuthorizationService.assertPermission(auth,'organization.settings.manage',destination.organizationId);destination.status='DISABLED';destination.isDefault=false;destination.updatedBy=auth.userId;await destination.save();await AuditService.record({organizationId:destination.organizationId,actorUserId:auth.userId,action:'payment.destination.disabled',resourceType:'PaymentDestination',resourceId:destination._id,metadata:{provider:destination.provider}});return destination;}

  static async confirmPayment(auth:AuthenticatedUser,id:string,data:AllocationInput){
    const payment=await Payment.findById(id);
    if(!payment)throw new AppError(404,'NOT_FOUND','Payment not found');
    ResourceScopeService.assertUnit(auth,payment,'payment.confirm',(await Tenant.findById(payment.tenantId).lean())?.userId);
    if(payment.status!=='PENDING')throw new AppError(409,'INVALID_PAYMENT_STATE','Only pending payments can be confirmed');
    const sum=data.allocations.reduce((total,item)=>total+item.amount,0);
    if(Math.abs(sum-payment.amount)>0.000001)throw new AppError(400,'ALLOCATION_MISMATCH','Allocation total must equal payment amount');

    const checked: Array<{charge:HydratedDocument<RentChargeDocument>;amount:number}> = [];
    const seen=new Set<string>();
    for(const item of data.allocations){
      if(seen.has(item.rentChargeId))throw new AppError(409,'DUPLICATE_ALLOCATION','A rent charge appears more than once');
      seen.add(item.rentChargeId);
      const charge=await RentCharge.findById(item.rentChargeId);
      if(!charge)throw new AppError(404,'RENT_CHARGE_NOT_FOUND','Rent charge not found');
      if(String(charge.organizationId)!==String(payment.organizationId)||String(charge.tenancyId)!==String(payment.tenancyId))throw new AppError(403,'INVALID_ALLOCATION','Payment can only be allocated to rent charges for the same tenancy');
      ResourceScopeService.assertUnit(auth,charge,'payment.confirm',(await Tenant.findById(charge.tenantId).lean())?.userId);
      assertMatchingCurrency(payment.currency,charge.currency);
      if(item.amount>charge.balanceAmount+0.000001)throw new AppError(409,'OVER_ALLOCATION','Allocation exceeds rent charge balance');
      const duplicate=await PaymentAllocation.exists({paymentId:payment._id,rentChargeId:charge._id});
      if(duplicate)throw new AppError(409,'DUPLICATE_ALLOCATION','Payment is already allocated to this rent charge');
      checked.push({charge,amount:item.amount});
    }
    for(const {charge,amount} of checked){
      await PaymentAllocation.create({organizationId:payment.organizationId,paymentId:payment._id,rentChargeId:charge._id,amount,allocatedBy:auth.userId});
      charge.paidAmount+=amount;
      charge.balanceAmount=Math.max(0,charge.totalAmount-charge.paidAmount);
      charge.status=charge.balanceAmount===0?'PAID':'PARTIALLY_PAID';
      charge.updatedBy=auth.userId;
      await charge.save();
    }
    payment.status='CONFIRMED';payment.confirmedAt=new Date();payment.paidAt=payment.paidAt??new Date();payment.updatedBy=auth.userId;
    await payment.save();
    return payment;
  }

  static async reversePayment(auth:AuthenticatedUser,id:string){const payment=await Payment.findById(id);if(!payment)throw new AppError(404,'NOT_FOUND','Payment not found');ResourceScopeService.assertUnit(auth,payment,'payment.reverse',(await Tenant.findById(payment.tenantId).lean())?.userId);if(payment.status!=='CONFIRMED')throw new AppError(409,'INVALID_PAYMENT_STATE','Only confirmed payments can be reversed');const allocations=await PaymentAllocation.find({paymentId:payment._id});for(const allocation of allocations){const charge=await RentCharge.findById(allocation.rentChargeId);if(!charge)continue;charge.paidAmount=Math.max(0,charge.paidAmount-allocation.amount);charge.balanceAmount=Math.max(0,charge.totalAmount-charge.paidAmount);charge.status=charge.balanceAmount===0?'PAID':(charge.paidAmount>0?'PARTIALLY_PAID':(charge.dueDate<new Date()?'OVERDUE':'OPEN'));charge.updatedBy=auth.userId;await charge.save();}payment.status='REVERSED';payment.reversedAt=new Date();payment.updatedBy=auth.userId;await payment.save();return payment;}

  static async listExpenses(auth:AuthenticatedUser,organizationId:string){const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'expense.view',orgId);const ids=await ResourceScopeService.scopedUnitIds(auth,orgId);const filter:Record<string,unknown>={organizationId:orgId};if(ids)filter.unitId={$in:ids};return Expense.find(filter).sort({incurredAt:-1}).lean();}

  static async createExpense(auth:AuthenticatedUser,organizationId:string,data:ExpenseInput){const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'expense.create',orgId);const property=await Property.findOne({_id:data.propertyId,organizationId:orgId}).lean();if(!property)throw new AppError(404,'PROPERTY_NOT_FOUND','Property not found');const resource={organizationId:orgId,propertyId:toId(data.propertyId),...(data.buildingId?{buildingId:toId(data.buildingId)}:{}),...(data.unitId?{unitId:toId(data.unitId)}:{})};AuthorizationService.assertCan(auth,'expense.create',resource);if(data.contractorId){const contractor=await Contractor.findOne({_id:data.contractorId,organizationId:orgId,status:'ACTIVE'}).lean();if(!contractor)throw new AppError(404,'CONTRACTOR_NOT_FOUND','Active contractor not found');}return Expense.create({organizationId:orgId,...data,propertyId:toId(data.propertyId),...(data.buildingId?{buildingId:toId(data.buildingId)}:{}),...(data.floorId?{floorId:toId(data.floorId)}:{}),...(data.unitId?{unitId:toId(data.unitId)}:{}),...(data.contractorId?{contractorId:toId(data.contractorId)}:{}),status:'DRAFT',sourceType:'MANUAL',createdBy:auth.userId,updatedBy:auth.userId});}

  private static async expenseAction(auth:AuthenticatedUser,id:string,action:'APPROVE'|'PAY'|'REJECT',notes?:string){const e=await Expense.findById(id);if(!e)throw new AppError(404,'NOT_FOUND','Expense not found');AuthorizationService.assertCan(auth,action==='APPROVE'?'expense.approve':action==='PAY'?'expense.pay':'expense.approve',resourceFor(e));if(action==='APPROVE'){if(!['DRAFT','SUBMITTED'].includes(e.status))throw new AppError(409,'INVALID_EXPENSE_STATE','Expense cannot be approved from its current state');e.status='APPROVED';e.approvedBy=auth.userId;e.approvedAt=new Date();}else if(action==='PAY'){if(e.status!=='APPROVED')throw new AppError(409,'INVALID_EXPENSE_STATE','Only approved expenses can be paid');e.status='PAID';e.paidAt=new Date();}else{if(!['DRAFT','SUBMITTED'].includes(e.status))throw new AppError(409,'INVALID_EXPENSE_STATE','Expense cannot be rejected from its current state');e.status='REJECTED';}if(notes)e.notes=notes;e.updatedBy=auth.userId;await e.save();return e;}
  static async approveExpense(auth:AuthenticatedUser,id:string,notes?:string){return this.expenseAction(auth,id,'APPROVE',notes);} static async payExpense(auth:AuthenticatedUser,id:string,notes?:string){return this.expenseAction(auth,id,'PAY',notes);} static async rejectExpense(auth:AuthenticatedUser,id:string,notes?:string){return this.expenseAction(auth,id,'REJECT',notes);}

  static async createServiceCharge(auth:AuthenticatedUser,organizationId:string,data:ServiceChargeInput){const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'service-charge.manage',orgId);const {tenancy}=await this.tenancyFor(auth,data.tenancyId,'service-charge.manage');if(String(tenancy.organizationId)!==String(orgId))throw new AppError(403,'ORGANIZATION_ACCESS_DENIED','Tenancy does not belong to this organization');return ServiceChargeAssessment.create({organizationId:orgId,...data,propertyId:tenancy.propertyId,buildingId:tenancy.buildingId,floorId:tenancy.floorId,unitId:tenancy.unitId,tenantId:tenancy.tenantId,tenancyId:tenancy._id,status:'ASSESSED',createdBy:auth.userId,updatedBy:auth.userId});}
  static async listServiceCharges(auth:AuthenticatedUser,organizationId:string){const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'service-charge.view',orgId);const ids=await ResourceScopeService.scopedUnitIds(auth,orgId);const filter:Record<string,unknown>={organizationId:orgId};if(ids)filter.unitId={$in:ids};return ServiceChargeAssessment.find(filter).sort({periodStart:-1}).lean();}

  static async listArrears(auth:AuthenticatedUser,organizationId:string){const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'arrears.view',orgId);const ids=await ResourceScopeService.scopedUnitIds(auth,orgId);const filter:Record<string,unknown>={organizationId:orgId,status:{$nin:['PAID','VOID']},balanceAmount:{$gt:0},dueDate:{$lt:new Date()}};if(ids)filter.unitId={$in:ids};const charges=await RentCharge.find(filter).sort({dueDate:1}).lean();return charges;}
  static async openArrearsCase(auth:AuthenticatedUser,organizationId:string,tenantId:string){const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'arrears.manage',orgId);const tenant=await Tenant.findOne({_id:tenantId,organizationId:orgId}).lean();if(!tenant)throw new AppError(404,'TENANT_NOT_FOUND','Tenant not found');const charges=await RentCharge.find({organizationId:orgId,tenantId:tenant._id,balanceAmount:{$gt:0},dueDate:{$lt:new Date()},status:{$nin:['VOID','PAID']}}).lean();if(!charges.length)throw new AppError(409,'NO_ARREARS','Tenant has no overdue balance');const first=charges[0];if(!first)throw new AppError(409,'NO_ARREARS','Tenant has no overdue balance');const existing=await ArrearsCase.findOne({organizationId:orgId,tenantId:tenant._id,status:{$nin:['RESOLVED','WRITTEN_OFF']}});if(existing){existing.amountOutstanding=charges.reduce((a,c)=>a+c.balanceAmount,0);existing.rentChargeIds=charges.map(c=>c._id);existing.updatedBy=auth.userId;await existing.save();return existing;}const c=await ArrearsCase.create({organizationId:orgId,propertyId:first.propertyId,buildingId:first.buildingId,floorId:first.floorId,unitId:first.unitId,tenantId:tenant._id,tenancyId:first.tenancyId,rentChargeIds:charges.map(x=>x._id),amountOutstanding:charges.reduce((a,x)=>a+x.balanceAmount,0),currency:first.currency,status:'OPEN',createdBy:auth.userId,updatedBy:auth.userId});return c;}
  static async updateArrearsCase(auth:AuthenticatedUser,id:string,data:ArrearsActionInput){const c=await ArrearsCase.findById(id);if(!c)throw new AppError(404,'NOT_FOUND','Arrears case not found');ResourceScopeService.assertCan(auth,'arrears.manage',resourceFor(c,(await Tenant.findById(c.tenantId).lean())?.userId));c.status=data.status;if(data.promiseDate)c.promiseDate=data.promiseDate;if(data.notes)c.notes=data.notes;if(['CONTACTED','PROMISED'].includes(data.status))c.lastContactedAt=new Date();if(['RESOLVED','WRITTEN_OFF'].includes(data.status))c.resolvedAt=new Date();c.updatedBy=auth.userId;await c.save();return c;}

  static async report(auth:AuthenticatedUser,organizationId:string,data:ReportInput){const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'financial.report.view',orgId);const from=new Date(data.from);from.setHours(0,0,0,0);const to=new Date(data.to);to.setHours(23,59,59,999);const unitIds=await ResourceScopeService.scopedUnitIds(auth,orgId);const base:Record<string,unknown>={organizationId:orgId};if(data.propertyId)base.propertyId=toId(data.propertyId);if(unitIds)base.unitId={$in:unitIds};
    const [rent,paid,expenses,service,activeTenancies,arrears]=await Promise.all([
      RentCharge.aggregate([{$match:{...base,periodStart:{$gte:from,$lte:to},status:{$ne:'VOID'}}},{$group:{_id:null,billed:{$sum:'$totalAmount'},paidApplied:{$sum:'$paidAmount'},balance:{$sum:'$balanceAmount'},rent:{$sum:'$rentAmount'},serviceCharge:{$sum:'$serviceChargeAmount'}}}]),
      Payment.aggregate([{$match:{...base,status:'CONFIRMED',paidAt:{$gte:from,$lte:to}}},{$group:{_id:null,collected:{$sum:'$amount'},count:{$sum:1}}}]),
      Expense.aggregate([{$match:{...base,incurredAt:{$gte:from,$lte:to},status:{$in:['APPROVED','PAID']}}},{$group:{_id:'$category',amount:{$sum:'$amount'},count:{$sum:1}}},{$sort:{amount:-1}}]),
      ServiceChargeAssessment.aggregate([{$match:{...base,periodStart:{$gte:from,$lte:to},status:{$ne:'VOID'}}},{$group:{_id:null,assessed:{$sum:'$amount'}}}]),
      Tenancy.countDocuments({organizationId:orgId,status:activeTenancyStatuses,...(unitIds?{unitId:{$in:unitIds}}:{})}),
      RentCharge.aggregate([{$match:{...base,dueDate:{$lt:new Date()},balanceAmount:{$gt:0},status:{$nin:['VOID','PAID']}}},{$group:{_id:null,amount:{$sum:'$balanceAmount'},count:{$sum:1}}}])
    ]);
    const billed=rent[0]?.billed??0;const collected=paid[0]?.collected??0;const expenseTotal=expenses.reduce((a,x)=>a+Number(x.amount),0);return {period:{from,to},revenue:{rentBilled:rent[0]?.rent??0,serviceChargesBilled:rent[0]?.serviceCharge??0,totalBilled:billed,totalCollected:collected,collectionRate:billed?Number(((collected/billed)*100).toFixed(2)):0,outstanding:billed-collected},expenses:{total:expenseTotal,byCategory:expenses},profitAndLoss:{accrual:billed-expenseTotal,cash:collected-expenseTotal},arrears:{amount:arrears[0]?.amount??0,chargeCount:arrears[0]?.count??0},serviceCharges:{assessed:service[0]?.assessed??0},occupancy:{activeTenancies},payments:{count:paid[0]?.count??0}};
  }

  static async listPeriods(auth:AuthenticatedUser,organizationId:string){const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'financial.period.view',orgId);return FinancialPeriod.find({organizationId:orgId}).sort({periodStart:-1}).lean();}
  static async createPeriod(auth:AuthenticatedUser,organizationId:string,data:PeriodInput){const orgId=toId(organizationId);AuthorizationService.assertPermission(auth,'financial.period.manage',orgId);return FinancialPeriod.create({organizationId:orgId,...data,status:'OPEN',createdBy:auth.userId,updatedBy:auth.userId});}
  static async closePeriod(auth:AuthenticatedUser,id:string){const p=await FinancialPeriod.findById(id);if(!p)throw new AppError(404,'NOT_FOUND','Financial period not found');AuthorizationService.assertPermission(auth,'financial.period.manage',p.organizationId);if(p.status!=='OPEN')throw new AppError(409,'PERIOD_CLOSED','Only open periods can be closed');p.status='CLOSED';p.closedAt=new Date();p.closedBy=auth.userId;p.updatedBy=auth.userId;await p.save();return p;}
  static async recordMaintenanceExpense(input:{organizationId:Types.ObjectId;propertyId:Types.ObjectId;buildingId:Types.ObjectId;floorId:Types.ObjectId;unitId:Types.ObjectId;maintenanceRequestId:Types.ObjectId;amount:number;incurredAt:Date;contractorId?:Types.ObjectId;currency?:string;createdBy:Types.ObjectId}){
    if(input.amount<=0)return null;const existing=await Expense.findOne({organizationId:input.organizationId,sourceType:'MAINTENANCE',sourceId:input.maintenanceRequestId});if(existing)return existing;return Expense.create({organizationId:input.organizationId,propertyId:input.propertyId,buildingId:input.buildingId,floorId:input.floorId,unitId:input.unitId,category:'MAINTENANCE',description:`Maintenance expenditure for request ${input.maintenanceRequestId.toString()}`,amount:input.amount,currency:input.currency??'KES',incurredAt:input.incurredAt,status:'APPROVED',contractorId:input.contractorId,maintenanceRequestId:input.maintenanceRequestId,sourceType:'MAINTENANCE',sourceId:input.maintenanceRequestId,createdBy:input.createdBy,updatedBy:input.createdBy});
  }
}
