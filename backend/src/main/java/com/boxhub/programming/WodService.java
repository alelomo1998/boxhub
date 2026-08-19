package com.boxhub.programming;

import com.boxhub.shared.TenantContext;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.NoSuchElementException;

@Service
public class WodService {

    private final WodRepository wods;
    private final BenchmarkTemplateRepository benchmarks;
    private final ObjectMapper om;

    public WodService(WodRepository wods, BenchmarkTemplateRepository benchmarks, ObjectMapper om) {
        this.wods = wods;
        this.benchmarks = benchmarks;
        this.om = om;
    }

    String serialize(WodJson.Blocks blocks) {
        WodJson.Blocks b = blocks == null ? WodJson.Blocks.empty() : blocks;
        WodJsonValidator.validateBlocks(b);
        try {
            return om.writeValueAsString(b);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid blocks");
        }
    }

    WodJson.Blocks deserialize(String json) {
        try {
            return om.readValue(json, WodJson.Blocks.class);
        } catch (JsonProcessingException e) {
            return WodJson.Blocks.empty();
        }
    }

    String serializeTiming(WodJson.Timing timing) {
        WodJson.Timing t = timing == null ? WodJson.Timing.empty() : timing;
        WodJsonValidator.validateTiming(t);
        try {
            return om.writeValueAsString(t);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid timing");
        }
    }

    WodJson.Timing deserializeTiming(String json) {
        try {
            return om.readValue(json, WodJson.Timing.class);
        } catch (JsonProcessingException e) {
            return WodJson.Timing.empty();
        }
    }

    public WodController.WodDto toDto(Wod w) {
        return new WodController.WodDto(w.getId(), w.getTitle(), WodTypeWire.toWodType(w.getMacro(), w.getTimingPreset()),
                w.getScoreType(), w.getTimeCapSeconds(), w.getBodyText(), deserialize(w.getBlocksJson()),
                w.getScalingNotes(), w.getBenchmarkTemplateId());
    }

    /** Clone a global benchmark template into a box WOD (tenant from TenantContext), keeping provenance. */
    Wod cloneFromBenchmark(java.util.UUID templateId) {
        BenchmarkTemplate t = benchmarks.findById(templateId).orElseThrow(NoSuchElementException::new);
        Wod w = new Wod();
        w.setTitle(t.getName());
        w.setMacro(WodTypeWire.toMacro("CUSTOM"));
        w.setTimingPreset(WodTypeWire.toTimingPreset("CUSTOM"));
        w.setScoreType(t.getScoreType());
        w.setTimeCapSeconds(t.getTimeCapSeconds());
        w.setBodyText(t.getBodyText());
        w.setBlocksJson(t.getBlocksJson());
        w.setBenchmarkTemplateId(t.getId());
        w.setCreatedBy(TenantContext.userId());
        return wods.save(w);
    }

    Instant now() { return Instant.now(); }
}
