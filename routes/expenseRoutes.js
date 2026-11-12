const router = require("express").Router();
const auth = require("../middlewares/authMiddleware");
const controller = require("../controllers/expenseController");

router.use(auth);
router.patch("/:expenseId", controller.update);
router.delete("/:expenseId", controller.remove);

module.exports = router;
