const express = require('express');
const { authenticate, authorize, requireRiderProfile } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');
const { receiptUpload } = require('../middleware/upload');

const auth = require('../controllers/authController');
const settings = require('../controllers/settingsController');
const fees = require('../controllers/feeController');
const deliveries = require('../controllers/deliveryController');
const expenses = require('../controllers/expenseController');
const closeouts = require('../controllers/closeoutController');
const corrections = require('../controllers/correctionController');
const riders = require('../controllers/riderController');
const bikes = require('../controllers/bikeController');
const dashboard = require('../controllers/dashboardController');
const reports = require('../controllers/reportController');
const auditLogs = require('../controllers/auditController');

const router = express.Router();
const admin = authorize('admin');
const anyRole = authorize('admin', 'rider');

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ---- Auth ----
router.post('/auth/login', loginLimiter, auth.login);
router.use(authenticate, requireRiderProfile); // everything below requires a valid session
router.get('/auth/me', auth.me);
router.post('/auth/change-password', auth.changePassword);

// ---- App config / settings / fees ----
router.get('/config', anyRole, settings.getAppConfig);
router.put('/settings', admin, settings.updateSettings);
router.get('/fees', admin, fees.listFees);
router.post('/fees', admin, fees.createFee);

// ---- Dashboards ----
router.get('/dashboard', admin, dashboard.adminDashboard);
router.get('/dashboard/rider', authorize('rider'), dashboard.riderDashboard);

// ---- Deliveries (riders are scoped to their own records in the controller) ----
router.get('/deliveries', anyRole, deliveries.listDeliveries);
router.post('/deliveries', anyRole, deliveries.createDelivery);
router.get('/deliveries/:id', anyRole, deliveries.getDelivery);
router.patch('/deliveries/:id', anyRole, deliveries.updateDelivery);
router.post('/deliveries/:id/correction-request', anyRole, deliveries.requestCorrection);
router.delete('/deliveries/:id', admin, deliveries.deleteDelivery);

// ---- Expenses ----
router.get('/expenses', anyRole, expenses.listExpenses);
router.post('/expenses', anyRole, receiptUpload, expenses.createExpense);
router.get('/expenses/:id', anyRole, expenses.getExpense);
router.patch('/expenses/:id', anyRole, receiptUpload, expenses.updateExpense);
router.get('/expenses/:id/receipt', anyRole, expenses.getReceipt);
router.patch('/expenses/:id/approve', admin, expenses.approveExpense);
router.delete('/expenses/:id', admin, expenses.deleteExpense);
router.patch('/expenses/:id/reject', admin, expenses.rejectExpense);
router.post('/expenses/:id/correction-request', anyRole, expenses.requestCorrection);

// ---- Daily closeouts / reconciliation ----
router.get('/closeouts/preview', anyRole, closeouts.previewCloseout);
router.get('/closeouts', anyRole, closeouts.listCloseouts);
router.post('/closeouts', anyRole, closeouts.submitCloseout);
router.get('/closeouts/:id', anyRole, closeouts.getCloseout);
router.post('/closeouts/:id/confirm', admin, closeouts.confirmCloseout);
router.post('/closeouts/:id/return', admin, closeouts.returnCloseout);
router.delete('/closeouts/:id', admin, closeouts.deleteCloseout);

// ---- Correction requests ----
router.get('/corrections', anyRole, corrections.listCorrections);
router.post('/corrections/:id/approve', admin, corrections.approveCorrection);
router.post('/corrections/:id/reject', admin, corrections.rejectCorrection);

// ---- Riders (management) ----
router.get('/riders', admin, riders.listRiders);
router.post('/riders', admin, riders.createRider);
router.get('/riders/:id', admin, riders.getRider);
router.patch('/riders/:id', admin, riders.updateRider);
router.delete('/riders/:id', admin, riders.deleteRider);
router.post('/riders/:id/reset-password', admin, riders.resetPassword);
router.post('/riders/:id/assign-bike', admin, riders.setRiderBike);
router.get('/riders/:id/performance', admin, riders.riderPerformance);
router.get('/riders/:id/activity', admin, riders.riderActivity);

// ---- Bikes ----
router.get('/bikes', anyRole, bikes.listBikes);
router.post('/bikes', admin, bikes.createBike);
router.patch('/bikes/:id', admin, bikes.updateBike);
router.delete('/bikes/:id', admin, bikes.deleteBike);

// ---- Reports ----
router.get('/reports/types', admin, reports.listTypes);
router.get('/reports', admin, reports.viewReport);
router.get('/reports/export/excel', admin, reports.exportExcel);
router.get('/reports/export/pdf', admin, reports.exportPdf);

// ---- Audit logs (read-only; no update/delete endpoints exist) ----
router.get('/audit-logs', admin, auditLogs.listAuditLogs);

module.exports = router;
