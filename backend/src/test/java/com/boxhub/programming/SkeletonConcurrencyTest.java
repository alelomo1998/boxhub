package com.boxhub.programming;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.box.ClassType;
import com.boxhub.box.ClassTypeRepository;
import com.boxhub.box.ScheduleSlot;
import com.boxhub.box.ScheduleSlotRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Real Testcontainers Postgres (from AbstractIntegrationTest) so
 * ClassTypeRepository.findWithLockById's SELECT ... FOR UPDATE actually serializes concurrent
 * transactions. Reproduces the shipped frontend's fan-out (types.page.ts saveSkeleton fires one PUT
 * per slot of a name group, in parallel — all resolving to the same class_type_id since M14a merged
 * same-named slots into one type) and proves SkeletonController.put no longer collides on
 * unique (box_id, class_type_id, sort_order) when that happens.
 */
class SkeletonConcurrencyTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired ClassTypeRepository types;
    @Autowired ScheduleSlotRepository slots;
    @Autowired TemplatePieceRepository pieces;
    @Autowired SkeletonController controller;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void concurrentSkeletonSavesOnASharedClassTypeBothSucceed() throws Exception {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Skel Conc " + n);
        box.setSlug("skel-conc-" + n);
        box.setTimezone("Europe/Rome");
        UUID boxId = boxes.save(box).getId();

        actAsBox(boxId);
        ClassType t = new ClassType();
        t.setName("WOD Class");
        UUID classTypeId = types.save(t).getId();

        ScheduleSlot s1 = new ScheduleSlot();
        s1.setClassTypeId(classTypeId);
        s1.setWeekday(0);
        s1.setStartTime(LocalTime.of(18, 0));
        s1.setDurationMin(60);
        s1.setCapacity(12);
        UUID slot1 = slots.save(s1).getId();

        ScheduleSlot s2 = new ScheduleSlot();
        s2.setClassTypeId(classTypeId);
        s2.setWeekday(1);
        s2.setStartTime(LocalTime.of(18, 0));
        s2.setDurationMin(60);
        s2.setCapacity(12);
        UUID slot2 = slots.save(s2).getId();
        SecurityContextHolder.clearContext();

        SkeletonController.SkeletonRequest req = new SkeletonController.SkeletonRequest(List.of(
                new SkeletonController.PieceInput("Warm-up", "WARMUP"),
                new SkeletonController.PieceInput("Strength", "STRENGTH"),
                new SkeletonController.PieceInput("Metcon", "FOR_TIME")));

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<?>> futures = List.of(
                    pool.submit(() -> racePut(boxId, slot1, req, ready, go)),
                    pool.submit(() -> racePut(boxId, slot2, req, ready, go)));
            ready.await(5, TimeUnit.SECONDS);
            go.countDown();
            for (var f : futures) f.get(10, TimeUnit.SECONDS); // throws if either PUT threw (e.g. 500)
        } finally {
            pool.shutdown();
        }

        actAsBox(boxId);
        List<TemplatePiece> saved = pieces.findByClassTypeIdOrderBySortOrderAsc(classTypeId);
        SecurityContextHolder.clearContext();

        // both requests succeeded (no exception above) and the class type ends up with exactly the
        // pieces saved — not zero (a lost write) and not a collision, no matter which request "won".
        assertThat(saved).extracting(TemplatePiece::getLabel)
                .containsExactly("Warm-up", "Strength", "Metcon");
    }

    private void racePut(UUID boxId, UUID slotId, SkeletonController.SkeletonRequest req,
                         CountDownLatch ready, CountDownLatch go) {
        try {
            actAsBox(boxId);
            ready.countDown();
            go.await(5, TimeUnit.SECONDS);
            controller.put(slotId, req);
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }
}
