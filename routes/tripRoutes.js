const router = require("express").Router();
const auth = require("../middlewares/authMiddleware");
const controller = require("../controllers/tripController");

router.use(auth);
router.post("/", controller.create);
router.get("/", controller.list);
router.get("/:tripId", controller.get);
router.patch("/:tripId", controller.update);
router.delete("/:tripId", controller.remove);
router.post("/:tripId/members", controller.addMember);
router.get("/:tripId/members", controller.listMembers);

module.exports = router;
