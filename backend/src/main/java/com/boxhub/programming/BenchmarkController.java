package com.boxhub.programming;

import com.boxhub.shared.RoleGuard;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/api/box/benchmarks")
public class BenchmarkController {

    private final BenchmarkTemplateRepository benchmarks;
    private final WodService wodService;

    public BenchmarkController(BenchmarkTemplateRepository benchmarks, WodService wodService) {
        this.benchmarks = benchmarks;
        this.wodService = wodService;
    }

    public record BenchmarkDto(UUID id, String name, String kind, String scoreType, Integer timeCapSeconds,
                               String bodyText, WodJson.Blocks blocks) {}

    private BenchmarkDto toDto(BenchmarkTemplate t) {
        return new BenchmarkDto(t.getId(), t.getName(), t.getKind(), t.getScoreType(), t.getTimeCapSeconds(),
                t.getBodyText(), wodService.deserialize(t.getBlocksJson()));
    }

    @GetMapping
    public List<BenchmarkDto> list(@RequestParam(required = false) String kind) {
        List<BenchmarkTemplate> found = kind == null
                ? benchmarks.findAllByOrderByKindAscNameAsc()
                : benchmarks.findByKindOrderByNameAsc(kind);
        return found.stream().map(this::toDto).toList();
    }

    @GetMapping("/{id}")
    public BenchmarkDto get(@PathVariable UUID id) {
        return toDto(benchmarks.findById(id).orElseThrow(NoSuchElementException::new));
    }

    @PostMapping("/{id}/clone")
    @ResponseStatus(HttpStatus.CREATED)
    public WodController.WodDto clone(@PathVariable UUID id) {
        RoleGuard.requireStaff();
        return wodService.toDto(wodService.cloneFromBenchmark(id));
    }
}
