package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface PtBookingRepository extends JpaRepository<PtBooking, UUID> {
    List<PtBooking> findByCoachMembershipIdOrderByStartsAt(UUID coachMembershipId);
    List<PtBooking> findByAthleteUserIdOrderByStartsAt(UUID athleteUserId);
}
