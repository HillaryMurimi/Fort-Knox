import { Types } from 'mongoose';
import { PredictiveObservation } from '../../database/models/PredictiveObservation.js';
import { PredictiveModel } from '../../database/models/PredictiveModel.js';
import { ModelTrainingRun } from '../../database/models/ModelTrainingRun.js';
import { RentCharge } from '../../database/models/RentCharge.js';
import { PaymentAllocation } from '../../database/models/PaymentAllocation.js';
import { Payment } from '../../database/models/Payment.js';
import { Tenancy } from '../../database/models/Tenancy.js';
import { Unit } from '../../database/models/Unit.js';
import { Property } from '../../database/models/Property.js';
import { AuthorizationService } from '../../core/authorization/authorization.service.js';
import { ResourceScopeService } from '../../core/authorization/resource-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../../core/errors/AppError.js';
import type { AuthenticatedUser } from '../../core/types/auth.js';
import type { LearnInput, PredictionInput } from './predictive-learning.schemas.js';

const DAY = 86_400_000;
const MODEL_PREFIX = 'ML_CALIBRATED_V1';

type Domain = 'ARREARS' | 'VACANCY' | 'REVENUE';

/** Matches the `status` enum on the PredictiveModel schema. */
type PredictiveModelStatus = 'CANDIDATE' | 'VALIDATED' | 'PROMOTED' | 'RETIRED';

type Sample = { x: number[]; y: number; observationId: Types.ObjectId };
type Metrics = Record<string, number>;
type Calibration = { kind: string; slope: number; intercept: number };

/** Shared shape for anything that can produce a prediction. */
type PredictiveModelParameters = {
  means: number[];
  scales: number[];
  coefficients: number[];
  intercept: number;
  modelType: string;
};

const round = (n: number) => Math.round(n * 10000) / 10000;
const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-40, Math.min(40, z))));
const oid = (v: string) => {
  if (!Types.ObjectId.isValid(v)) throw new AppError(400, 'INVALID_ID', 'Invalid ObjectId');
  return new Types.ObjectId(v);
};

function featureOrder(domain: Domain) {
  if (domain === 'ARREARS') {
    return ['outstandingRatio', 'daysPastDue', 'paymentConsistency', 'notice', 'arrearsVelocity'];
  }
  if (domain === 'VACANCY') {
    return ['currentVacancyDays', 'historicalMedianDays', 'occupancyRate'];
  }
  return ['baselineMonthlyRevenue', 'collectionRate', 'healthVelocity', 'vacancyRiskAmount', 'arrearsRiskAmount'];
}

function vector(doc: { features?: Map<string, number> | Record<string, number> }, names: string[]) {
  return names.map((n) =>
    Number(
      doc.features instanceof Map
        ? doc.features.get(n) ?? 0
        : (doc.features as Record<string, number>)[n] ?? 0,
    ),
  );
}

function normalize(samples: Sample[]) {
  const p = samples[0]?.x.length ?? 0;
  const means = Array.from(
    { length: p },
    (_, j) => samples.reduce((s, a) => s + a.x[j]!, 0) / samples.length,
  );
  const scales = means.map((m, j) => {
    const v =
      samples.reduce((s, a) => s + (a.x[j]! - m) ** 2, 0) / Math.max(1, samples.length - 1);
    return Math.sqrt(v) || 1;
  });
  return { means, scales };
}

function transform(x: number[], means: number[], scales: number[]) {
  return x.map((v, i) => (v - means[i]!) / scales[i]!);
}

function trainLogistic(samples: Sample[], epochs = 700, lr = 0.08) {
  const { means, scales } = normalize(samples);
  const p = means.length;
  const w = Array(p).fill(0);
  let b = 0;
  for (let e = 0; e < epochs; e++) {
    const gw = Array(p).fill(0);
    let gb = 0;
    for (const s of samples) {
      const x = transform(s.x, means, scales);
      const err = sigmoid(b + x.reduce((z, v, j) => z + w[j]! * v, 0)) - s.y;
      for (let j = 0; j < p; j++) gw[j] += err * x[j]!;
      gb += err;
    }
    for (let j = 0; j < p; j++) w[j] -= (lr * gw[j]) / samples.length;
    b -= (lr * gb) / samples.length;
  }
  return { means, scales, coefficients: w, intercept: b };
}

function trainRidge(samples: Sample[], lambda = 0.5, epochs = 900, lr = 0.04) {
  const { means, scales } = normalize(samples);
  const p = means.length;
  const w = Array(p).fill(0);
  let b = samples.reduce((s, a) => s + a.y, 0) / samples.length;
  for (let e = 0; e < epochs; e++) {
    const gw = Array(p).fill(0);
    let gb = 0;
    for (const s of samples) {
      const x = transform(s.x, means, scales);
      const pred = b + x.reduce((z, v, j) => z + w[j]! * v, 0);
      const err = pred - s.y;
      for (let j = 0; j < p; j++) gw[j] += err * x[j]!;
      gb += err;
    }
    for (let j = 0; j < p; j++) {
      w[j] -= lr * (gw[j] / samples.length + (lambda * w[j]) / samples.length);
    }
    b -= (lr * gb) / samples.length;
  }
  return { means, scales, coefficients: w, intercept: b };
}

function predict(model: PredictiveModelParameters, x: number[]) {
  const z =
    model.intercept +
    transform(x, model.means, model.scales).reduce(
      (s, v, j) => s + model.coefficients[j]! * v,
      0,
    );
  return model.modelType === 'LOGISTIC_REGRESSION' ? sigmoid(z) : Math.max(0, z);
}

function rawLogit(
  model: { means: number[]; scales: number[]; coefficients: number[]; intercept: number },
  x: number[],
) {
  return (
    model.intercept +
    transform(x, model.means, model.scales).reduce(
      (s, v, j) => s + model.coefficients[j]! * v,
      0,
    )
  );
}

function fitPlatt(
  samples: Sample[],
  model: { means: number[]; scales: number[]; coefficients: number[]; intercept: number },
) {
  let a = 1;
  let b = 0;
  for (let e = 0; e < 500; e++) {
    let ga = 0;
    let gb = 0;
    for (const s of samples) {
      const p = sigmoid(a * rawLogit(model, s.x) + b);
      const err = p - s.y;
      ga += err * rawLogit(model, s.x);
      gb += err;
    }
    a -= (0.05 * ga) / Math.max(1, samples.length);
    b -= (0.05 * gb) / Math.max(1, samples.length);
  }
  return { kind: 'PLATT' as const, slope: a, intercept: b };
}

function fitLinearCalibration(samples: Sample[], model: PredictiveModelParameters) {
  const predictions = samples.map((sample) => predict(model, sample.x));
  const targets = samples.map((sample) => sample.y);

  const predictionMean = predictions.reduce((sum, value) => sum + value, 0) / predictions.length;
  const targetMean = targets.reduce((sum, value) => sum + value, 0) / targets.length;

  const denominator = predictions.reduce(
    (sum, prediction) => sum + (prediction - predictionMean) ** 2,
    0,
  );

  const slope = denominator
    ? predictions.reduce(
        (sum, prediction, index) =>
          sum + (prediction - predictionMean) * (targets[index]! - targetMean),
        0,
      ) / denominator
    : 1;

  return { kind: 'LINEAR' as const, slope, intercept: targetMean - slope * predictionMean };
}

function calibratedPrediction(
  model: PredictiveModelParameters & { calibration: Calibration },
  x: number[],
) {
  const raw = predict(model, x);
  return model.calibration.kind === 'PLATT'
    ? sigmoid(model.calibration.slope * rawLogit(model, x) + model.calibration.intercept)
    : Math.max(0, model.calibration.slope * raw + model.calibration.intercept);
}

function classificationMetrics(
  samples: Sample[],
  model: PredictiveModelParameters,
  calibration: Calibration,
): Metrics {
  const rows = samples.map((s) => ({
    y: s.y,
    p: calibratedPrediction({ ...model, calibration }, s.x),
  }));
  const tp = rows.filter((r) => r.y === 1 && r.p >= 0.5).length;
  const tn = rows.filter((r) => r.y === 0 && r.p < 0.5).length;
  const fp = rows.filter((r) => r.y === 0 && r.p >= 0.5).length;
  const fn = rows.filter((r) => r.y === 1 && r.p < 0.5).length;
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const sorted = [...rows].sort((a, b) => b.p - a.p);
  const pos = rows.filter((r) => r.y === 1).length;
  const neg = rows.length - pos;
  let rankSum = 0;
  sorted.forEach((r, i) => {
    if (r.y === 1) rankSum += i + 1;
  });
  const auc = pos && neg ? (rankSum - (pos * (pos + 1)) / 2) / (pos * neg) : 0.5;
  const brier = rows.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / Math.max(1, rows.length);
  return {
    accuracy: (tp + tn) / Math.max(1, rows.length),
    precision,
    recall,
    f1: (2 * precision * recall) / Math.max(0.0001, precision + recall),
    auc,
    brierScore: brier,
  };
}

function regressionMetrics(
  samples: Sample[],
  model: PredictiveModelParameters,
  calibration: Calibration,
): Metrics {
  const ys = samples.map((s) => s.y);
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const errs = samples.map((s) => calibratedPrediction({ ...model, calibration }, s.x) - s.y);
  const mae = errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length;
  const rmse = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
  const ssr = errs.reduce((s, e) => s + e * e, 0);
  const sst = ys.reduce((s, y) => s + (y - mean) ** 2, 0);
  return { mae, rmse, r2: sst ? 1 - ssr / sst : 0 };
}

export class PredictiveLearningService {
  static async label(auth: AuthenticatedUser, organizationId: string, input: LearnInput) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, 'predictive-learning.label.manage', org);
    return this.labelSystem(org, input.asOf ?? new Date(), input.horizonDays, input.domain);
  }

  static async labelSystem(
    org: Types.ObjectId,
    asOf: Date,
    horizonDays = 30,
    domain?: Domain,
  ) {
    const domains: Domain[] = domain ? [domain] : ['ARREARS', 'VACANCY', 'REVENUE'];
    const counts: Record<string, number> = {};
    for (const d of domains) counts[d] = await this.labelDomain(org, asOf, horizonDays, d);
    return { asOf, horizonDays, counts };
  }

  private static async labelDomain(
    org: Types.ObjectId,
    asOf: Date,
    horizonDays: number,
    domain: Domain,
  ) {
    const cutoff = new Date(asOf.getTime() - horizonDays * DAY);
    const observations = await PredictiveObservation.find({
      organizationId: org,
      modelDomain: domain,
      labelStatus: 'PENDING',
      observationAt: { $lte: cutoff },
    }).limit(5000);

    let observed = 0;
    let censored = 0;
    for (const o of observations) {
      const r = await this.computeOutcome(org, o.toObject(), horizonDays);
      if (r.status === 'OBSERVED') {
        o.outcome = r.outcome;
        o.outcomeObservedAt = r.observedAt;
        o.labelStatus = 'OBSERVED';
        observed++;
      } else {
        o.labelStatus = 'CENSORED';
        o.outcomeObservedAt = r.observedAt;
        censored++;
      }
      await o.save();
    }
    return observed + censored;
  }

  private static async computeOutcome(
    org: Types.ObjectId,
    o: any,
    horizonDays: number,
  ): Promise<{ status: 'OBSERVED' | 'CENSORED'; outcome: number; observedAt: Date }> {
    const end = new Date(o.observationAt.getTime() + horizonDays * DAY);

    if (o.modelDomain === 'ARREARS') {
      const t = await Tenancy.findOne({
        organizationId: org,
        tenantId: o.entityId,
        startDate: { $lte: o.observationAt },
        status: { $in: ['ACTIVE', 'NOTICE', 'MOVED_OUT', 'TERMINATED'] },
      })
        .sort({ startDate: -1 })
        .lean();
      if (!t) return { status: 'CENSORED', outcome: 0, observedAt: end };

      const charges = await RentCharge.find({
        organizationId: org,
        tenantId: o.entityId,
        dueDate: { $gte: o.observationAt, $lte: end },
        status: { $ne: 'VOID' },
      }).lean();
      const obligation = Math.max(1, t.monthlyRent + t.serviceCharge);
      const outstanding = charges.reduce((s, c) => s + Math.max(0, c.balanceAmount), 0);
      const defaulted =
        outstanding >= obligation * 0.5 ||
        (await RentCharge.exists({
          organizationId: org,
          tenantId: o.entityId,
          dueDate: { $lte: end },
          status: 'OVERDUE',
          balanceAmount: { $gte: obligation * 0.5 },
        }));
      return { status: 'OBSERVED', outcome: defaulted ? 1 : 0, observedAt: end };
    }

    if (o.modelDomain === 'VACANCY') {
      const u = await Unit.findOne({ _id: o.entityId, organizationId: org }).lean();
      if (!u) return { status: 'CENSORED', outcome: 0, observedAt: end };

      const next = await Tenancy.findOne({
        organizationId: org,
        unitId: o.entityId,
        startDate: { $gt: o.observationAt, $lte: end },
        status: { $in: ['ACTIVE', 'NOTICE', 'MOVED_OUT', 'TERMINATED'] },
      })
        .sort({ startDate: 1 })
        .lean();
      if (next) {
        return {
          status: 'OBSERVED',
          outcome: Math.max(0, (next.startDate.getTime() - o.observationAt.getTime()) / DAY),
          observedAt: next.startDate,
        };
      }
      return { status: 'CENSORED', outcome: 0, observedAt: end };
    }

    // REVENUE
    const units = await Unit.find({
      organizationId: org,
      propertyId: o.entityId,
      status: { $ne: 'INACTIVE' },
    })
      .select('monthlyRent')
      .lean();
    if (!units.length) return { status: 'OBSERVED', outcome: 0, observedAt: end };

    const baseline = units.reduce((s, u) => s + u.monthlyRent, 0) * (horizonDays / 30);
    const charges = await RentCharge.find({
      organizationId: org,
      propertyId: o.entityId,
      periodStart: { $gte: o.observationAt, $lt: end },
      status: { $ne: 'VOID' },
    })
      .select('_id')
      .lean();
    const ids = charges.map((c) => c._id);
    const allocations = ids.length
      ? await PaymentAllocation.find({ organizationId: org, rentChargeId: { $in: ids } })
          .select('paymentId amount')
          .lean()
      : [];
    const paymentIds = allocations.map((a) => a.paymentId);
    const payments = paymentIds.length
      ? await Payment.find({
          organizationId: org,
          _id: { $in: paymentIds },
          status: 'CONFIRMED',
          paidAt: { $lte: end },
        })
          .select('_id')
          .lean()
      : [];
    const valid = new Set(payments.map((p) => String(p._id)));
    const collected = allocations
      .filter((a) => valid.has(String(a.paymentId)))
      .reduce((s, a) => s + a.amount, 0);

    return { status: 'OBSERVED', outcome: Math.max(0, baseline - collected), observedAt: end };
  }

  static async train(auth: AuthenticatedUser, organizationId: string, input: LearnInput) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, 'predictive-learning.train', org);
    return this.trainSystem(org, input.domain, input.minSamples ?? 50);
  }

  static async trainSystem(org: Types.ObjectId, domain?: Domain, minSamples = 50) {
    const domains: Domain[] = domain ? [domain] : ['ARREARS', 'VACANCY', 'REVENUE'];
    const results = [];
    for (const d of domains) results.push(await this.trainDomain(org, d, minSamples));
    return results;
  }

  private static async trainDomain(org: Types.ObjectId, domain: Domain, minSamples: number) {
    const run = await ModelTrainingRun.create({
      organizationId: org,
      domain,
      startedAt: new Date(),
      status: 'RUNNING',
    });

    try {
      const names = featureOrder(domain);
      const docs = await PredictiveObservation.find({
        organizationId: org,
        modelDomain: domain,
        labelStatus: 'OBSERVED',
        outcome: { $exists: true },
      })
        .sort({ observationAt: 1 })
        .lean();

      const samples: Sample[] = docs
        .map((d) => ({ x: vector(d, names), y: Number(d.outcome), observationId: d._id }))
        .filter((s) => s.x.every(Number.isFinite) && Number.isFinite(s.y));

      if (samples.length < minSamples) {
        run.status = 'INSUFFICIENT_DATA';
        run.sampleCount = samples.length;
        run.completedAt = new Date();
        await run.save();
        return { domain, status: run.status, sampleCount: samples.length };
      }

      const trainEnd = Math.max(15, Math.floor(samples.length * 0.7));
      const calibrationEnd = Math.max(trainEnd + 8, Math.floor(samples.length * 0.85));
      const train = samples.slice(0, trainEnd);
      const calibrationSet = samples.slice(trainEnd, calibrationEnd);
      const validation = samples.slice(calibrationEnd);

      const modelType = domain === 'ARREARS' ? 'LOGISTIC_REGRESSION' : 'RIDGE_REGRESSION';
      const fitted =
        modelType === 'LOGISTIC_REGRESSION' ? trainLogistic(train) : trainRidge(train);

      // Add modelType so the calibration/predict helpers see the full parameter object.
      const fittedWithType: PredictiveModelParameters = { ...fitted, modelType };

      const calibration =
        modelType === 'LOGISTIC_REGRESSION'
          ? fitPlatt(calibrationSet, fitted)
          : fitLinearCalibration(calibrationSet, fittedWithType);

      const metrics =
        modelType === 'LOGISTIC_REGRESSION'
          ? classificationMetrics(validation, fittedWithType, calibration)
          : regressionMetrics(validation, fittedWithType, calibration);

      const passed =
        modelType === 'LOGISTIC_REGRESSION'
          ? metrics.auc >= 0.65 && metrics.brierScore <= 0.22 && metrics.recall >= 0.5
          : metrics.rmse <=
              Math.max(1, Math.abs(train.reduce((s, a) => s + a.y, 0) / train.length) * 0.75) &&
            metrics.r2 >= 0.1;

      const version = `${MODEL_PREFIX}_${domain}_${new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, '')}`;

      const m = await PredictiveModel.create({
        organizationId: org,
        domain,
        version,
        modelType,
        featureNames: names,
        means: fitted.means,
        scales: fitted.scales,
        coefficients: fitted.coefficients,
        intercept: fitted.intercept,
        calibration,
        metrics: {
          sampleCount: samples.length,
          trainCount: train.length,
          validationCount: validation.length,
          ...metrics,
        },
        validationPassed: passed,
        status: passed ? 'VALIDATED' : 'CANDIDATE',
        trainedAt: new Date(),
        metadata: {
          calibrationCount: calibrationSet.length,
          holdoutCount: validation.length,
          validationRule:
            domain === 'ARREARS'
              ? 'AUC>=0.65,Brier<=0.22,Recall>=0.50'
              : 'RMSE<=75% train mean,R2>=0.10',
        },
      });

      run.status = 'SUCCEEDED';
      run.completedAt = new Date();
      run.sampleCount = samples.length;
      run.trainCount = train.length;
      run.validationCount = validation.length;
      run.modelId = m._id;
      run.set('metrics', metrics);
      await run.save();
      return m.toObject();
    } catch (e) {
      run.status = 'FAILED';
      run.error = e instanceof Error ? e.message : 'Unknown training failure';
      run.completedAt = new Date();
      await run.save();
      throw e;
    }
  }

  static async listModels(
    auth: AuthenticatedUser,
    organizationId: string,
    q: { domain?: Domain; status?: PredictiveModelStatus; limit: number },
  ) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, 'predictive-learning.model.view', org);
    await ResourceScopeService.scopedPropertyIds(auth, org);

    return PredictiveModel.find({
      organizationId: org,
      ...(q.domain ? { domain: q.domain } : {}),
      ...(q.status ? { status: q.status } : {}),
    })
      .sort({ trainedAt: -1 })
      .limit(q.limit)
      .lean();
  }

  static async promote(auth: AuthenticatedUser, organizationId: string, modelId: string) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, 'predictive-learning.model.manage', org);

    const id = oid(modelId);
    const candidate = await PredictiveModel.findOne({ _id: id, organizationId: org });
    if (!candidate) throw new AppError(404, 'MODEL_NOT_FOUND', 'Predictive model not found');
    if (!candidate.validationPassed) {
      throw new AppError(409, 'MODEL_NOT_VALIDATED', 'Only a validation-passing model can be promoted');
    }

    await PredictiveModel.updateMany(
      { organizationId: org, domain: candidate.domain, status: 'PROMOTED' },
      { $set: { status: 'RETIRED', retiredAt: new Date() } },
    );

    candidate.status = 'PROMOTED';
    candidate.promotedAt = new Date();
    await candidate.save();

    await AuditService.record({
      organizationId: org,
      actorUserId: auth.userId,
      action: 'predictive-model.promoted',
      resourceType: 'PredictiveModel',
      resourceId: candidate._id,
      after: candidate.toObject(),
    });
    return candidate;
  }

  static async predict(
    auth: AuthenticatedUser,
    organizationId: string,
    input: PredictionInput,
  ) {
    const org = oid(organizationId);
    AuthorizationService.assertPermission(auth, 'predictive-learning.model.view', org);

    const model = await this.activeModel(org, input.domain);
    if (!model) {
      throw new AppError(
        409,
        'MODEL_NOT_AVAILABLE',
        'No promoted validated model is available for this domain',
      );
    }

    // Guard against malformed persisted model data — fail loudly, don't silently
    // coerce with `!` or `as`.
    if (!model.calibration) {
      throw new AppError(
        500,
        'MODEL_CALIBRATION_MISSING',
        'Predictive model calibration data is missing',
      );
    }
    if (!model.metrics) {
      throw new AppError(
        500,
        'MODEL_METRICS_MISSING',
        'Predictive model metrics are missing',
      );
    }

    const cal = model.calibration;
    const metrics = model.metrics;

    const names = model.featureNames as string[];
    const x = names.map((n) => Number(input.features[n] ?? 0));

    const raw =
      Number(model.intercept) +
      x
        .map(
          (v, i) =>
            (v - Number(model.means[i] ?? 0)) / (Number(model.scales[i] ?? 1) || 1),
        )
        .reduce((sum, v, i) => sum + Number(model.coefficients[i] ?? 0) * v, 0);

    let value: number;
    if (cal.kind === 'PLATT') {
      value = sigmoid(Number(cal.slope) * raw + Number(cal.intercept));
    } else {
      value = Math.max(0, Number(cal.slope) * raw + Number(cal.intercept));
    }

    return {
      domain: input.domain,
      modelVersion: model.version,
      value,
      confidence: Math.max(0, Math.min(1, 1 - Number(metrics.brierScore ?? 0))),
      calibrated: true,
    };
  }

  static async activeModel(org: Types.ObjectId, domain: Domain) {
    return PredictiveModel.findOne({
      organizationId: org,
      domain,
      status: 'PROMOTED',
      validationPassed: true,
    })
      .sort({ promotedAt: -1 })
      .lean();
  }
}