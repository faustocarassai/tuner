var w = window;
var DO = document;
var mLoginAct = null;
var LC_USER = null;
var LC = "/";
var LC_PAIS = "";
var MSIE = navigator.userAgent.indexOf("MSIE") != -1 ? true : false;
ck = DO.cookie;
i = ck.indexOf("pub_pais");
if (i != -1) {
    e = ck.indexOf(";", i + 9);
    LC_PAIS = e != -1 ? ck.substr(i + 9, e - i - 9) : ck.substr(i + 9);
}

var yinThreshold = 0.15;
var yinProbability = 0;

var useSPP = false;
var useAC = false;
var useYin = true;
var volumeThreshold = 134;
var nPitchValues = 5;
var audioContext = null;
var analyserNode = null;
var processNode = null;
var microphoneNode = null;
var gainNode = null;
var lowPassFilter1 = null;
var lowPassFilter2 = null;
var highPassFilter1 = null;
var highPassFilter2 = null;
var lowestFreq = 30;
var highestFreq = 4200;
var twelfthRootOfTwo = 1.0594630943592953;
var otthRootOfTwo = 1.0005777895;
var refNoteLabels = [
    "A",
    "A#",
    "B",
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
];
var refFreq = 440;
var refNoteIndex = 0;
var noteFrequencies = [];
var noteLabels = [];
var pitchHistory = [];
var pixelsPerCent = 3;
var silenceTimeout = null;
var minUpdateDelay = 100;
var notebarForegroundColor = "#333";

function GE(elm) {
    return DO.getElementById(elm);
}

function HTML(elm, newdata) {
    if (typeof newdata != "undefined") GE(elm).innerHTML = newdata;
    else return GE(elm).innerHTML;
}

var showBrowserDialog = function () {
    $("#wt-inhibit").show();
};

var showMicrophoneDialog = function () {
    $("#wt-inhibit").show();
    $("#microphone-support-popup").show();
    $("#microphone-support-popup").css(
        "left",
        ($("#wt-main").width() - $("#microphone-support-popup").width()) / 2
    );
    $("#microphone-support-popup").css(
        "top",
        ($("#wt-main").outerHeight() -
            $("#microphone-support-popup").outerHeight()) /
        2
    );
};

function Yin_pitchEstimation(inputBuffer, sampleRate) {
    var yinBuffer = new Float32Array(Math.floor(inputBuffer.length / 2));
    yinBuffer[0] = 1;
    var runningSum = 0;
    var pitchInHz = 0;
    var foundTau = false;
    var minTauValue;
    var minTau = 0;
    for (var tau = 1; tau < Math.floor(inputBuffer.length / 2); tau++) {
        yinBuffer[tau] = 0;
        for (var i = 0; i < Math.floor(inputBuffer.length / 2); i++)
            yinBuffer[tau] += Math.pow(
                (inputBuffer[i] - 128) / 128 - (inputBuffer[i + tau] - 128) / 128,
                2
            );
        runningSum += yinBuffer[tau];
        yinBuffer[tau] = yinBuffer[tau] * (tau / runningSum);
        if (tau > 1)
            if (foundTau)
                if (yinBuffer[tau] < minTauValue) {
                    minTauValue = yinBuffer[tau];
                    minTau = tau;
                } else break;
            else if (yinBuffer[tau] < yinThreshold) {
                foundTau = true;
                minTau = tau;
                minTauValue = yinBuffer[tau];
            }
    }
    if (minTau == 0) {
        yinProbability = 0;
        pitchInHz = 0;
    } else {
        minTau +=
            (yinBuffer[minTau + 1] - yinBuffer[minTau - 1]) /
            (2 *
                (2 * yinBuffer[minTau] -
                    yinBuffer[minTau - 1] -
                    yinBuffer[minTau + 1]));
        pitchInHz = sampleRate / minTau;
        yinProbability = 1 - minTauValue;
    }
    return pitchInHz;
}

$(window).on("load", function () {
    window.requestAnimationFrame =
        window.requestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.msRequestAnimationFrame;
    window.AudioContext =
        window.AudioContext ||
        window.webkitAudioContext ||
        window.mozAudioContext ||
        window.oAudioContext ||
        window.msAudioContext;
    navigator.getUserMedia =
        navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msGetUserMedia;
    generateNoteBarCanvas();
    if (
        window.requestAnimationFrame &&
        window.AudioContext &&
        navigator.getUserMedia
    )
        try {
            navigator.getUserMedia({ audio: true }, gotStream, function (err) {
                showMicrophoneDialog();
                $(window).load(function () {
                    showMicrophoneDialog();
                });
                console.log("DEBUG: Error getting microphone input: " + err);
            });
        } catch (e) {
            showMicrophoneDialog();
            $(window).load(function () {
                showMicrophoneDialog();
            });
            console.log("DEBUG: Couldn't get microphone input: " + e);
        }
    else {
        showBrowserDialog();
        $(window).load(function () {
            showBrowserDialog();
        });
        console.log("DEBUG: Web Audio API is not supported");
    }
    function gotStream(stream) {
        audioContext = new AudioContext();
        microphoneNode = audioContext.createMediaStreamSource(stream);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 2048;
        analyserNode.smoothingTimeConstant = 0.8;
        gainNode = audioContext.createGain();
        gainNode.gain.value = 1.5;
        lowPassFilter1 = audioContext.createBiquadFilter();
        lowPassFilter2 = audioContext.createBiquadFilter();
        highPassFilter1 = audioContext.createBiquadFilter();
        highPassFilter2 = audioContext.createBiquadFilter();
        lowPassFilter1.Q.value = 0;
        lowPassFilter1.frequency.value = highestFreq;
        lowPassFilter1.type = "lowpass";
        lowPassFilter2.Q.value = 0;
        lowPassFilter2.frequency.value = highestFreq;
        lowPassFilter2.type = "lowpass";
        highPassFilter1.Q.value = 0;
        highPassFilter1.frequency.value = lowestFreq;
        highPassFilter1.type = "highpass";
        highPassFilter2.Q.value = 0;
        highPassFilter2.frequency.value = lowestFreq;
        highPassFilter2.type = "highpass";
        microphoneNode.connect(lowPassFilter1);
        lowPassFilter1.connect(lowPassFilter2);
        lowPassFilter2.connect(highPassFilter1);
        highPassFilter1.connect(highPassFilter2);
        highPassFilter2.connect(gainNode);
        gainNode.connect(analyserNode);
        initGui();
    }
    function initGui() {
        defineNoteFrequencies();
        updatePitch();
    }
    function updatePitch(time) {
        var pitchInHz = 0;
        var volumeCheck = false;
        var maxVolume = 128;
        var inputBuffer = new Uint8Array(analyserNode.fftSize);
        analyserNode.getByteTimeDomainData(inputBuffer);
        for (var i = 0; i < inputBuffer.length / 4; i++) {
            if (maxVolume < inputBuffer[i]) maxVolume = inputBuffer[i];
            if (!volumeCheck && inputBuffer[i] > volumeThreshold) volumeCheck = true;
        }
        if (volumeCheck)
            pitchInHz = Yin_pitchEstimation(inputBuffer, audioContext.sampleRate);
        var allowedHzDifference = 5;
        if (pitchInHz != 0) {
            clearTimeout(silenceTimeout);
            silenceTimeout = null;
            if (pitchHistory.length >= nPitchValues) pitchHistory.shift();
            if (
                pitchHistory.length &&
                Math.abs(pitchInHz / 2 - pitchHistory[pitchHistory.length - 1]) <
                allowedHzDifference
            )
                pitchInHz = pitchInHz / 2;
            pitchInHz = Math.round(pitchInHz * 10) / 10;
            pitchHistory.push(pitchInHz);
            var sortedPitchHistory = pitchHistory.slice(0).sort(function (a, b) {
                return a - b;
            });
            pitchInHz =
                sortedPitchHistory[Math.floor((sortedPitchHistory.length - 1) / 2)];
            updateGui(
                pitchInHz,
                getClosestNoteIndex(pitchInHz),
                (maxVolume - 128) / 128
            );
            if (pitchHistory.length < nPitchValues)
                window.requestAnimationFrame(updatePitch);
            else
                setTimeout(function () {
                    window.requestAnimationFrame(updatePitch);
                }, minUpdateDelay);
        } else {
            if (silenceTimeout === null)
                silenceTimeout = setTimeout(function () {
                    pitchHistory = [];
                    updateGui(0, false, 0);
                }, 500);
            window.requestAnimationFrame(updatePitch);
        }
    }
    function generateNoteBarCanvas() {
        var c = $("#wt-bar")[0];
        c.width = 2 * pixelsPerCent * 1200;
        var h = c.height;
        var halfH = Math.round(h / 2);
        var ctx = c.getContext("2d");
        ctx.lineWidth = 1;
        ctx.strokeStyle = notebarForegroundColor;
        ctx.beginPath();
        for (var x = 0, n = 0; x < c.width; x += pixelsPerCent * 5, n++) {
            var lh = 5;
            if (n == 5) {
                lh = 10;
                n = 0;
            }
            ctx.moveTo(x, h - lh);
            ctx.lineTo(x, h);
        }
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.strokeStyle = notebarForegroundColor;
        ctx.font = "18px Verdana";
        ctx.fillStyle = notebarForegroundColor;
        for (var x = 0, s = 10, n = 0; x <= c.width; x += pixelsPerCent * 10, s++) {
            ctx.beginPath();
            if (s == 10) {
                if (refNoteLabels[n].length == 1)
                    ctx.fillText(refNoteLabels[n], x - 6, halfH - 10);
                else if (refNoteLabels[n].length == 2)
                    ctx.fillText(refNoteLabels[n], x - 11, halfH - 10);
                else ctx.fillText(refNoteLabels[n], x - 16, halfH - 10);
                n++;
                if (n == 12) n = 0;
                s = 0;
                ctx.arc(x, halfH, 4, 0, 2 * Math.PI, true);
                ctx.stroke();
            } else {
                ctx.arc(x, halfH, 1, 0, 2 * Math.PI, true);
                ctx.stroke();
            }
        }
        $("#wt-notebar").scrollLeft(
            1200 * pixelsPerCent - $("#wt-notebar").width() / 2
        );
    }
    function updateGui(currentFreq, closestIndex, maxVolume) {
        $("#wt-micmonitor #wt-volumemeter").width(
            Math.round($("#wt-micmonitor #wt-volumebackground").width() * maxVolume) -
            4
        );
        if (closestIndex === false || currentFreq == 0) {
            $("#wt-note span").eq(0).css("opacity", "0.1");
            $("#wt-note span").eq(1).css("opacity", "0.1");
            $("#wt-note span").eq(2).css("opacity", "0.1");
            $("#wt-hz span").eq(0).html("0");
            $("#wt-cents span").eq(0).html("0");
            $("#wt-leftarrow").css("border-right", "");
            $("#wt-rightarrow").css("border-left", "");
        } else {
            var centDiff = getCentDiff(
                currentFreq,
                noteFrequencies[closestIndex]
            ).toFixed(1);
            $("#wt-note span")
                .eq(2)
                .html(noteLabels[closestIndex].charAt(0))
                .css("opacity", "1");
            if (
                noteLabels[closestIndex].charAt(noteLabels[closestIndex].length - 1) ==
                "#"
            ) {
                $("#wt-note span").eq(1).css("opacity", "1");
                $("#wt-note span")
                    .eq(0)
                    .html(
                        noteLabels[closestIndex].substring(
                            1,
                            noteLabels[closestIndex].length - 1
                        )
                    )
                    .css("opacity", "1");
            } else {
                $("#wt-note span").eq(1).css("opacity", "0.1");
                $("#wt-note span")
                    .eq(0)
                    .html(
                        noteLabels[closestIndex].substring(
                            1,
                            noteLabels[closestIndex].length
                        )
                    )
                    .css("opacity", "1");
            }
            $("#wt-hz span").eq(0).html(currentFreq);
            $("#wt-cents span").eq(0).html(centDiff);
            if (Math.abs(centDiff) < 5) {
                $("#wt-rightarrow").css("border-left", "60px solid rgba(0,200,0,1)");
                $("#wt-leftarrow").css("border-right", "60px solid rgba(0,200,0,1)");
            } else {
                var redOpacity = Math.abs(centDiff) / 25;
                if (redOpacity > 1) redOpacity = 1;
                if (centDiff < 0) {
                    $("#wt-rightarrow").css(
                        "border-left",
                        "60px solid rgba(220,0,0," + redOpacity + ")"
                    );
                    $("#wt-leftarrow").css("border-right", "");
                } else {
                    $("#wt-leftarrow").css(
                        "border-right",
                        "60px solid rgba(220,0,0," + redOpacity + ")"
                    );
                    $("#wt-rightarrow").css("border-left", "");
                }
            }
            var sleft = findRefNoteIndex(noteLabels[closestIndex].substring(1));
            if (sleft > 6) sleft -= 12;
            sleft = (sleft * 100 + parseFloat(centDiff)) * pixelsPerCent;
            sleft = Math.round(
                1200 * pixelsPerCent - $("#wt-notebar").width() / 2 + sleft
            );
            $("#wt-notebar").stop().animate({ scrollLeft: sleft }, minUpdateDelay);
        }
    }
    function findRefNoteIndex(noteLabel) {
        for (var i = 0; i < refNoteLabels.length; i++)
            if (refNoteLabels[i] == noteLabel) return i;
        return false;
    }
    function getClosestNoteIndex(f) {
        if (f == 0) return false;
        for (var i = 0; i < noteFrequencies.length; i++)
            if (f < noteFrequencies[i])
                if (i > 0 && noteFrequencies[i] - f > f - noteFrequencies[i - 1])
                    return i - 1;
                else return i;
        return false;
    }
    function getCentDiff(fCurrent, fRef) {
        return (1200 * Math.log(fCurrent / fRef)) / Math.log(2);
    }
    function getSemituneDiff(fCurrent, fRef) {
        return (12 * Math.log(fCurrent / fRef)) / Math.log(2);
    }
    function defineNoteFrequencies() {
        var noteFreq = 0;
        var greaterNoteFrequencies = [];
        var greaterNoteLabels = [];
        var lowerNoteFrequencies = [];
        var lowerNoteLabels = [];
        var octave = 4;
        for (var i = 0; ; i++) {
            if ((i + 9) % 12 == 0) octave++;
            noteFreq = refFreq * Math.pow(twelfthRootOfTwo, i);
            if (noteFreq > 4187) break;
            greaterNoteFrequencies.push(noteFreq);
            greaterNoteLabels.push(
                octave + refNoteLabels[(refNoteIndex + i) % refNoteLabels.length]
            );
        }
        octave = 4;
        for (var i = -1; ; i--) {
            if ((Math.abs(i) + 2) % 12 == 0) octave--;
            noteFreq = refFreq * Math.pow(twelfthRootOfTwo, i);
            if (noteFreq < 28) break;
            lowerNoteFrequencies.push(noteFreq);
            var relativeIndex = (refNoteIndex + i) % refNoteLabels.length;
            relativeIndex =
                relativeIndex == 0 ? 0 : relativeIndex + refNoteLabels.length;
            lowerNoteLabels.push(octave + refNoteLabels[relativeIndex]);
        }
        lowerNoteFrequencies.reverse();
        lowerNoteLabels.reverse();
        noteFrequencies = lowerNoteFrequencies.concat(greaterNoteFrequencies);
        noteLabels = lowerNoteLabels.concat(greaterNoteLabels);
    }
    $("#config-panel").on("panelbeforeopen", function () {
        $("#mic-monitor").fadeOut(200);
        $("#config-button").fadeOut(200);
    });
    $("#config-panel").on("panelbeforeclose", function () {
        $("#mic-monitor").fadeIn(200);
        $("#config-button").fadeIn(200);
    });
    $("#help-panel").on("panelbeforeopen", function () {
        $("#social").fadeOut(200);
        $("#help-button").fadeOut(200);
    });
    $("#help-panel").on("panelbeforeclose", function () {
        $("#social").fadeIn(200);
        $("#help-button").fadeIn(200);
    });
    $("#volume-slider").on("change", function () {
        if (gainNode != null) gainNode.gain.value = $(this).val() / 100;
        else console.log("DEBUG: Unable to change volume (gain node unavailable)");
    });
    $("#lowf-slider").on("change", function () {
        lowestFreq = $(this).val();
        if (highPassFilter1 != null && highPassFilter2 != null) {
            highPassFilter1.frequency.value = lowestFreq;
            highPassFilter2.frequency.value = lowestFreq;
        } else console.log("DEBUG: Unable to set high pass filter frequency (filter unavailable)");
    });
    $("#highf-slider").on("change", function () {
        highestFreq = $(this).val();
        if (lowPassFilter1 != null && lowPassFilter2 != null) {
            lowPassFilter1.frequency.value = highestFreq;
            lowPassFilter2.frequency.value = highestFreq;
        } else console.log("DEBUG: Unable to set low pass filter frequency (filter unavailable)");
    });
    $("#a4-slider").on("change", function () {
        refFreq = $(this).val();
        defineNoteFrequencies();
    });
    $("#wt-type0").click(function () {
        refNoteLabels = [
            "A",
            "A#",
            "B",
            "C",
            "C#",
            "D",
            "D#",
            "E",
            "F",
            "F#",
            "G",
            "G#",
        ];
        defineNoteFrequencies();
        generateNoteBarCanvas();
        var closestIndex = 48;
        var centDiff = 0;
        var currentFreq = 440;
        $("#wt-note span").eq(2).html(noteLabels[closestIndex].charAt(0));
        if (
            noteLabels[closestIndex].charAt(noteLabels[closestIndex].length - 1) ==
            "#"
        )
            $("#wt-note span")
                .eq(0)
                .html(
                    noteLabels[closestIndex].substring(
                        1,
                        noteLabels[closestIndex].length - 1
                    )
                );
        else
            $("#wt-note span")
                .eq(0)
                .html(
                    noteLabels[closestIndex].substring(1, noteLabels[closestIndex].length)
                );
        $("#wt-hz span").eq(0).html(currentFreq);
        $("#wt-cents span").eq(0).html(centDiff);
        $("#wt-type1").removeClass("wt-checked");
        $(this).addClass("wt-checked");
    });
    $("#wt-type1").click(function () {
        refNoteLabels = [
            "La",
            "La#",
            "Si",
            "Do",
            "Do#",
            "Re",
            "Re#",
            "Mi",
            "Fa",
            "Fa#",
            "Sol",
            "Sol#",
        ];
        defineNoteFrequencies();
        generateNoteBarCanvas();
        var closestIndex = 48;
        var centDiff = 0;
        var currentFreq = 440;
        $("#wt-note span").eq(2).html(noteLabels[closestIndex].charAt(0));
        if (
            noteLabels[closestIndex].charAt(noteLabels[closestIndex].length - 1) ==
            "#"
        )
            $("#wt-note span")
                .eq(0)
                .html(
                    noteLabels[closestIndex].substring(
                        1,
                        noteLabels[closestIndex].length - 1
                    )
                );
        else
            $("#wt-note span")
                .eq(0)
                .html(
                    noteLabels[closestIndex].substring(1, noteLabels[closestIndex].length)
                );
        $("#wt-hz span").eq(0).html(currentFreq);
        $("#wt-cents span").eq(0).html(centDiff);
        $("#wt-type0").removeClass("wt-checked");
        $(this).addClass("wt-checked");
    });
});
